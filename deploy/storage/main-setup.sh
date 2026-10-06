#!/usr/bin/env bash
# Main server: the tunnel to the storage server (10.77.0.1 → 10.77.0.2), then checks — the share mounts
# and takes a file, downloads can leave through the storage server's IP. Nothing of the app is touched.
set -euo pipefail
STORE_PUB="$1"; STORE_IP="$2"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq wireguard-tools nfs-common curl >/dev/null
if ! ip link show avr0 >/dev/null 2>&1 && ip route | grep -q '^10\.77\.0\.'; then
  echo "::error::На основном сервере сеть 10.77.0.0/24 уже занята — туннель не ставлю, чтобы ничего не сломать"; exit 4
fi

cat > /etc/wireguard/avr0.conf <<CONF
[Interface]
Address = 10.77.0.1/24
PostUp = wg set %i private-key /etc/wireguard/avr.key

[Peer]
PublicKey = $STORE_PUB
Endpoint = $STORE_IP:51820
AllowedIPs = 10.77.0.2/32
PersistentKeepalive = 25
CONF
chmod 600 /etc/wireguard/avr0.conf
systemctl enable wg-quick@avr0 >/dev/null 2>&1
systemctl restart wg-quick@avr0

for i in 1 2 3 4 5 6; do ping -c1 -W2 10.77.0.2 >/dev/null 2>&1 && break; sleep 2; done
ping -c1 -W2 10.77.0.2 >/dev/null 2>&1 || { echo "::error::Туннель не поднялся: хранилище не отвечает по 10.77.0.2 (проверьте, что у хостера открыт UDP 51820)"; exit 5; }
RTT="$(ping -c5 -q 10.77.0.2 | awk -F/ '/rtt|round-trip/ {printf "%.0f", $5}')"

T=/mnt/avr-store-test
mkdir -p "$T"
mountpoint -q "$T" || mount -t nfs4 -o soft,timeo=100,retrans=3 10.77.0.2:/srv/storage/media "$T"
dd if=/dev/zero of="$T/.avr-speed-test" bs=1M count=64 conv=fsync status=none
TIMEFORMAT=%R; SPEED="$( { time dd if="$T/.avr-speed-test" of=/dev/null bs=1M status=none iflag=direct; } 2>&1 | tail -1)"
rm -f "$T/.avr-speed-test"
umount "$T"

EXIT_IP="$(curl -sS -m 20 -x http://10.77.0.2:8888 https://api.ipify.org || echo '?')"
YT="$(curl -sS -m 20 -x http://10.77.0.2:8888 -o /dev/null -w '%{http_code}' https://www.youtube.com/ || echo '?')"
echo "::notice::Туннель работает: задержка до хранилища ${RTT} мс, папка подключается, 64 МБ читаются за ${SPEED} с; скачивание через хранилище выходит с IP ${EXIT_IP}, YouTube отвечает ${YT}"
echo "::notice::Музыки сейчас на основном сервере: $(du -sh /srv/avrmusic/media 2>/dev/null | cut -f1)"
