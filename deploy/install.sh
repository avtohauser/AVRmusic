#!/usr/bin/env bash
# One-shot installer for a fresh Ubuntu/Debian server.
#   curl -fsSL https://raw.githubusercontent.com/avtohauser/AVRmusic/claude/music-service-streaming-nfpgvx/deploy/install.sh | bash -s -- music.avthsr.space
# or: bash deploy/install.sh music.avthsr.space
set -euo pipefail
DOMAIN="${1:-${DOMAIN:-}}"
BRANCH="${BRANCH:-claude/music-service-streaming-nfpgvx}"
REPO="${REPO:-https://github.com/avtohauser/AVRmusic.git}"
APP_DIR="${APP_DIR:-/opt/avrmusic}"
DATA_ROOT="${DATA_ROOT:-/srv/avrmusic}"
if [[ -z "$DOMAIN" ]]; then echo "Usage: install.sh <domain>"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "Run as root"; exit 1; fi

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin >/dev/null

echo "==> Firewall (22, 80, 443)"
# Best effort: some VPS images (LXC/OpenVZ, missing iptables) cannot run ufw; the hoster's firewall applies then.
if command -v ufw >/dev/null && ufw allow OpenSSH >/dev/null 2>&1 && ufw allow 80/tcp >/dev/null 2>&1 \
   && ufw allow 443/tcp >/dev/null 2>&1 && ufw allow 443/udp >/dev/null 2>&1; then
  ufw --force enable >/dev/null 2>&1 || echo "    ufw enable failed, leaving the firewall as is"
else
  echo "    ufw is not usable on this server, leaving the firewall as is (open 80/443 in the hoster panel if needed)"
fi

echo "==> Source ($BRANCH)"
if [[ -f "$APP_DIR/package.json" && ! -d "$APP_DIR/.git" ]]; then echo "    using the tree already present in $APP_DIR (copied by CI)";
elif [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" checkout -q "$BRANCH" && git -C "$APP_DIR" pull -q origin "$BRANCH" \
    || echo "    git update failed (private repository?), using the tree as is";
else git clone -q --branch "$BRANCH" --depth 1 "$REPO" "$APP_DIR"; fi
mkdir -p "$DATA_ROOT"/{data,media,music}

echo "==> Config"
cd "$APP_DIR"
if [[ ! -f .env ]]; then
  cp deploy/.env.prod.example .env
  sed -i "s#^DOMAIN=.*#DOMAIN=$DOMAIN#" .env
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -hex 32)#" .env
  sed -i "s#^INVITE_CODE=.*#INVITE_CODE=$(openssl rand -hex 4)#" .env
  sed -i "s#^DATA_PATH=.*#DATA_PATH=$DATA_ROOT/data#; s#^MEDIA_PATH=.*#MEDIA_PATH=$DATA_ROOT/media#; s#^MUSIC_PATH=.*#MUSIC_PATH=$DATA_ROOT/music#" .env
fi

echo "==> Ports 80/443"
# Caddy needs 80/443. Fresh VPS images often ship a default nginx/apache page; stop it only when it
# serves nothing but the default site. Anything else (a panel, another site) must be freed by hand.
default_site_only() {
  case "$1" in
    nginx)  [[ -z "$(ls -A /etc/nginx/sites-enabled 2>/dev/null | grep -vx default)" ]] && ! grep -rqs server_name /etc/nginx/conf.d ;;
    apache2|httpd) [[ -z "$(ls -A /etc/apache2/sites-enabled 2>/dev/null | grep -vx 000-default.conf)" ]] ;;
    *) return 1 ;;
  esac
}
free_port() {
  local port="$1" line proc
  line="$(ss -Hltnp "sport = :$port" 2>/dev/null | head -n1 || true)"
  [[ -n "$line" ]] || { echo "    $port: free"; return 0; }
  proc="$(printf '%s' "$line" | sed -nE 's/.*users:\(\("([^"]+)".*/\1/p')"
  case "$proc" in
    docker-proxy|caddy) echo "    $port: used by our own Caddy container, fine" ;;
    nginx|apache2|httpd)
      if default_site_only "$proc"; then
        echo "    $port: $proc serves only its default page - stopping and disabling it (systemctl enable --now $proc to undo)"
        systemctl disable --now "$proc" >/dev/null 2>&1 || true
      else
        echo "    $port: $proc hosts other sites; move them or stop $proc, then re-run the deploy"; echo "    $line"; exit 1
      fi ;;
    *) echo "    $port is busy: $line"; echo "    free the port and re-run the deploy"; exit 1 ;;
  esac
}
free_port 80; free_port 443

echo "==> Build & start (first build takes a few minutes)"
docker compose -f docker-compose.prod.yml up -d --build

echo
echo "AVRmusic is starting: https://$DOMAIN"
echo "Invite code for friends (INVITE_CODE in $APP_DIR/.env): $(grep ^INVITE_CODE= .env | cut -d= -f2)"
echo "First registered account becomes the administrator."
echo "Update later:  push to the branch (GitHub Actions deploy) or: cd $APP_DIR && git pull && docker compose -f docker-compose.prod.yml up -d --build"
