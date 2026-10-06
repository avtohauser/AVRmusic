#!/usr/bin/env bash
# Storage server: the tunnel end (10.77.0.2), the music folder shared with the main server only, and an
# HTTP proxy the main server's downloads may leave from (this server's IP for YouTube).
set -euo pipefail
MAIN_PUB="$1"
STORE_DIR=/srv/storage/media
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq wireguard-tools nfs-kernel-server tinyproxy ufw curl >/dev/null

cat > /etc/wireguard/avr0.conf <<CONF
[Interface]
Address = 10.77.0.2/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/avr.key

[Peer]
PublicKey = $MAIN_PUB
AllowedIPs = 10.77.0.1/32
CONF
chmod 600 /etc/wireguard/avr0.conf
systemctl enable wg-quick@avr0 >/dev/null 2>&1
systemctl restart wg-quick@avr0

install -d -m 755 "$STORE_DIR"
grep -q "^$STORE_DIR " /etc/exports 2>/dev/null || echo "$STORE_DIR 10.77.0.1(rw,sync,no_subtree_check,no_root_squash)" >> /etc/exports
systemctl enable --now nfs-server >/dev/null 2>&1
exportfs -ra

# the proxy listens on the tunnel only and lets in the main server only
C=/etc/tinyproxy/tinyproxy.conf
sed -i -E 's/^#?[[:space:]]*Listen .*/Listen 10.77.0.2/; /^Allow /d; s/^Timeout .*/Timeout 900/; s/^#?[[:space:]]*MaxClients .*/MaxClients 64/' "$C"
grep -q '^Listen 10.77.0.2' "$C" || echo 'Listen 10.77.0.2' >> "$C"
echo 'Allow 10.77.0.1' >> "$C"
grep -q '^ConnectPort 443' "$C" || echo 'ConnectPort 443' >> "$C"
install -d /etc/systemd/system/tinyproxy.service.d
printf '[Unit]\nAfter=wg-quick@avr0.service\nRequires=wg-quick@avr0.service\n' > /etc/systemd/system/tinyproxy.service.d/avr.conf
systemctl daemon-reload
systemctl enable tinyproxy >/dev/null 2>&1
systemctl restart tinyproxy

# firewall: SSH (the port this session came in on), WireGuard, and everything from the main server through the tunnel
SSH_PORT="$(echo "${SSH_CONNECTION:-x x x 22}" | awk '{print $4}')"
ufw allow "$SSH_PORT/tcp" >/dev/null
ufw allow 51820/udp >/dev/null
ufw allow in on avr0 from 10.77.0.1 >/dev/null
ufw --force enable >/dev/null 2>&1 || echo "::warning::ufw не включился на хранилище — закройте всё, кроме SSH и 51820/udp, в панели хостера"

echo "::notice::Хранилище: $(df -h --output=size,avail "$STORE_DIR" | tail -1 | awk '{print "диск " $1 ", свободно " $2}'), туннель и прокси запущены"
