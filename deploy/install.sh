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
set_env() { if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi; }
if [[ ! -f .env ]]; then
  cp deploy/.env.prod.example .env
  set_env JWT_SECRET "$(openssl rand -hex 32)"
  set_env INVITE_CODE "$(openssl rand -hex 4)"
  set_env DATA_PATH "$DATA_ROOT/data"; set_env MEDIA_PATH "$DATA_ROOT/media"; set_env MUSIC_PATH "$DATA_ROOT/music"
fi
set_env DOMAIN "$DOMAIN"
env_get() { (grep "^$1=" .env || true) | head -n1 | cut -d= -f2-; }

echo "==> Reverse proxy"
# Who owns ports 80/443? Our own Caddy (docker-proxy) or nothing → Caddy mode. The host's nginx → nginx mode:
# the app is published on 127.0.0.1:$APP_PORT and nginx gets one extra server block (other sites untouched).
port_owner() { ss -Hltnp "sport = :$1" 2>/dev/null | sed -nE 's/.*users:\(\("([^"]+)".*/\1/p' | head -n1 || true; }
PROXY="$(env_get PROXY)"
if [[ -z "$PROXY" ]]; then
  case "$(port_owner 80)" in
    nginx) PROXY=nginx ;;
    ""|docker-proxy|caddy) PROXY=caddy ;;
    *) echo "    port 80 is used by '$(port_owner 80)'. Set PROXY=nginx in $APP_DIR/.env after moving to nginx, or free 80/443 for Caddy."; exit 1 ;;
  esac
  set_env PROXY "$PROXY"
fi
if [[ "$PROXY" == "caddy" ]]; then
  set_env COMPOSE_PROFILES caddy
  for port in 80 443; do
    owner="$(port_owner "$port")"
    [[ -z "$owner" || "$owner" == docker-proxy || "$owner" == caddy ]] || { echo "    port $port is used by '$owner'; free it or set PROXY=nginx in .env"; exit 1; }
  done
  echo "    Caddy on 80/443 (automatic HTTPS)"
else
  set_env COMPOSE_PROFILES ""
  APP_PORT="$(env_get APP_PORT)"
  if [[ -z "$APP_PORT" ]]; then
    for p in 8080 8081 8082 8083 8084 8090 8091 8092 8095 8099; do [[ -z "$(ss -Hltn "sport = :$p" 2>/dev/null)" ]] && { APP_PORT=$p; break; }; done
    [[ -n "${APP_PORT:-}" ]] || { echo "    no free port between 8080 and 8099"; exit 1; }
    set_env APP_PORT "$APP_PORT"
  fi
  echo "    host nginx → 127.0.0.1:$APP_PORT"
fi

echo "==> Build & start (first build takes a few minutes)"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
[[ "$PROXY" == "caddy" ]] || docker rm -f avrmusic-caddy-1 >/dev/null 2>&1 || true

if [[ "$PROXY" == "nginx" ]]; then
  echo "==> nginx site for $DOMAIN"
  if grep -qs "sites-enabled" /etc/nginx/nginx.conf; then
    SITE=/etc/nginx/sites-available/avrmusic.conf; mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled; ln -sf "$SITE" /etc/nginx/sites-enabled/avrmusic.conf
  elif grep -qs "conf.d/\*.conf" /etc/nginx/nginx.conf; then
    SITE=/etc/nginx/conf.d/avrmusic.conf
  else
    echo "    cannot find where nginx includes site configs (no sites-enabled / conf.d in nginx.conf)"; exit 1
  fi
  ACME_ROOT=/var/www/avrmusic-acme; mkdir -p "$ACME_ROOT"
  write_site() {  # $1 = http | https
    {
      echo "# AVRmusic ($DOMAIN) - written by $APP_DIR/deploy/install.sh; other sites are not touched."
      echo "server {"
      echo "    listen 80;"
      echo "    server_name $DOMAIN;"
      echo "    location /.well-known/acme-challenge/ { root $ACME_ROOT; }"
      if [[ "$1" == https ]]; then echo '    location / { return 301 https://$host$request_uri; }'; else proxy_block; fi
      echo "}"
      if [[ "$1" == https ]]; then
        echo "server {"
        echo "    listen 443 ssl http2;"
        echo "    server_name $DOMAIN;"
        echo "    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
        echo "    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
        echo "    ssl_protocols TLSv1.2 TLSv1.3;"
        echo '    add_header X-Content-Type-Options nosniff;'
        echo '    add_header Referrer-Policy strict-origin-when-cross-origin;'
        proxy_block
        echo "}"
      fi
    } > "$SITE"
  }
  proxy_block() {
    cat <<NGINX
    client_max_body_size 4g;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 30m;
        proxy_send_timeout 30m;
    }
NGINX
  }
  apply_site() { nginx -t >/dev/null 2>&1 || { echo "    nginx -t failed with our config; removing it and leaving nginx as it was:"; nginx -t 2>&1 | tail -5; rm -f "$SITE" /etc/nginx/sites-enabled/avrmusic.conf; exit 1; }; systemctl reload nginx; }
  if [[ ! -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    write_site http; apply_site
    command -v certbot >/dev/null || apt-get install -y -qq certbot >/dev/null
    LE_EMAIL="$(env_get LE_EMAIL)"; le_args=(--register-unsafely-without-email); [[ -z "$LE_EMAIL" ]] || le_args=(-m "$LE_EMAIL")
    if ! certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" -n --agree-tos "${le_args[@]}" \
         --deploy-hook "systemctl reload nginx" --keep-until-expiring; then
      echo "    Let's Encrypt failed (is $DOMAIN pointing at this server and port 80 reachable?). The site is up over plain HTTP for now."; exit 1
    fi
  fi
  write_site https; apply_site
  echo "    https://$DOMAIN → 127.0.0.1:$APP_PORT (certificate renews via the certbot timer)"
fi

echo
echo "AVRmusic is starting: https://$DOMAIN"
echo "Invite code for friends (INVITE_CODE in $APP_DIR/.env): $(grep ^INVITE_CODE= .env | cut -d= -f2)"
echo "First registered account becomes the administrator."
echo "Update later:  push to the branch (GitHub Actions deploy) or re-run: bash $APP_DIR/deploy/install.sh $DOMAIN"
