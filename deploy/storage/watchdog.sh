#!/usr/bin/env bash
# Storage server: a watchdog for the main server. Every minute it asks the site whether it is alive; after
# three failed checks in a row the admins hear it in Telegram (and once an hour while it lasts), and again
# when the site is back. The bot's token and the admins' chats come from the app itself, which keeps them
# in a root-only file next to the music (.watchdog.env) — nothing to set up here by hand.
#   watchdog.sh install — installs the check as a systemd timer
#   watchdog.sh         — one check (what the timer runs)
set -uo pipefail
ENV_FILE=/srv/storage/media/.watchdog.env
STATE=/var/lib/avr-watchdog

if [ "${1:-}" = install ]; then
  set -e
  command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; } >/dev/null
  install -m 755 "$0" /usr/local/bin/avr-watchdog
  cat > /etc/systemd/system/avr-watchdog.service <<'UNIT'
[Unit]
Description=avr music: is the main server alive?
[Service]
Type=oneshot
ExecStart=/usr/local/bin/avr-watchdog
UNIT
  cat > /etc/systemd/system/avr-watchdog.timer <<'UNIT'
[Unit]
Description=avr music: check the main server every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now avr-watchdog.timer >/dev/null 2>&1
  if [ -r "$ENV_FILE" ]; then echo "::notice::Сторож установлен и знает, кого предупреждать"
  else echo "::notice::Сторож установлен; предупреждать начнёт, когда в Админке будет бот Telegram и вы привяжете его в профиле"; fi
  exit 0
fi

mkdir -p "$STATE"
[ -r "$ENV_FILE" ] || exit 0
TOKEN="$(sed -n 's/^TOKEN=//p' "$ENV_FILE" | head -n1)"
CHATS="$(sed -n 's/^CHATS=//p' "$ENV_FILE" | head -n1)"
URL="$(sed -n 's/^URL=//p' "$ENV_FILE" | head -n1)"
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]] || exit 0
[[ "$URL" =~ ^https?://[A-Za-z0-9.:/_-]+$ ]] || exit 0

send() {
  local c
  for c in $CHATS; do
    [[ "$c" =~ ^-?[0-9]+$ ]] || continue
    curl -fsS -m 15 -o /dev/null "https://api.telegram.org/bot$TOKEN/sendMessage" \
      --data-urlencode "chat_id=$c" --data-urlencode "text=$1" 2>/dev/null || true
  done
}

fails="$(cat "$STATE/fails" 2>/dev/null || echo 0)"; [[ "$fails" =~ ^[0-9]+$ ]] || fails=0
down="$(cat "$STATE/down" 2>/dev/null || true)"
now="$(date +%s)"

if curl -fsS -m 15 -o /dev/null "$URL" 2>/dev/null; then
  if [[ "$down" =~ ^[0-9]+$ ]]; then send "✅ avr music снова работает (не отвечал около $(( (now - down) / 60 )) мин)"; fi
  echo 0 > "$STATE/fails"
  rm -f "$STATE/down"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE/fails"
if [ "$fails" -eq 3 ]; then
  echo $((now - 180)) > "$STATE/down"
  send "⚠️ avr music не отвечает уже 3 минуты — основной сервер или сайт лежит"
elif [ "$fails" -gt 3 ] && [ $(( (fails - 3) % 60 )) -eq 0 ]; then
  send "⚠️ avr music всё ещё не отвечает (около $(( fails / 60 )) ч)"
fi
