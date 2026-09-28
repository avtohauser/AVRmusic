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

echo "==> Firewall (22, 80, 443)"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

echo "==> Source ($BRANCH)"
if [[ -d "$APP_DIR/.git" ]]; then git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" checkout -q "$BRANCH" && git -C "$APP_DIR" pull -q origin "$BRANCH";
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

echo "==> Build & start (first build takes a few minutes)"
docker compose -f docker-compose.prod.yml up -d --build

echo
echo "AVRmusic is starting: https://$DOMAIN"
echo "Invite code for friends (INVITE_CODE in $APP_DIR/.env): $(grep ^INVITE_CODE= .env | cut -d= -f2)"
echo "First registered account becomes the administrator."
echo "Update later:  cd $APP_DIR && git pull && docker compose -f docker-compose.prod.yml up -d --build"
