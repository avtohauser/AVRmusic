#!/usr/bin/env bash
# Main server: move the music (MEDIA_PATH: tracks, covers, canvases…) to the storage server and mount it
# back in the same place, so the app and its database see the same paths. Copied while the app runs, then
# the app stops for the last changes only. Any failure puts everything back as it was. The local copy is
# kept (…/media-local-old) until it is removed on purpose.
set -euo pipefail
APP=/opt/avrmusic
cd "$APP"
env_get() { (grep "^$1=" .env || true) | head -n1 | cut -d= -f2-; }
set_env() { if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi; }
MEDIA="$(env_get MEDIA_PATH)"; MEDIA="${MEDIA:-/srv/avrmusic/media}"
SHARE=10.77.0.2:/srv/storage/media
MARK=.avr-storage
OPTS=rw,soft,timeo=150,retrans=3,_netdev,nofail,x-systemd.requires=wg-quick@avr0.service
DC="docker compose -f docker-compose.prod.yml"

if grep -q " $MEDIA nfs" /proc/mounts && [ -f "$MEDIA/$MARK" ]; then echo "::notice::Музыка уже на хранилище — переносить нечего"; exit 0; fi
ip link show avr0 >/dev/null 2>&1 || { echo "::error::Туннель к хранилищу не поднят — сначала шаг setup"; exit 1; }

T=/mnt/avr-store
mkdir -p "$T"
mountpoint -q "$T" || mount -t nfs4 -o rw,hard,timeo=600 "$SHARE" "$T"
need=$(du -sb "$MEDIA" | cut -f1); avail=$(df --output=avail -B1 "$T" | tail -1)
if [ "$need" -gt $((avail - 2*1024*1024*1024)) ]; then echo "::error::На хранилище не хватает места: нужно $((need/1024/1024/1024)) ГБ, свободно $((avail/1024/1024/1024)) ГБ"; umount "$T"; exit 1; fi

stopped=0; swapped=0
rollback() {
  echo "::error::Перенос прерван — возвращаю всё как было"
  if [ "$swapped" = 1 ]; then
    umount "$MEDIA" 2>/dev/null || umount -l "$MEDIA" 2>/dev/null || true
    sed -i "\\#^$SHARE $MEDIA #d" /etc/fstab
    rmdir "$MEDIA" 2>/dev/null || true
    [ -d "$MEDIA-local-old" ] && mv "$MEDIA-local-old" "$MEDIA"
    sed -i '/^DOWNLOAD_PROXIES=/d; /^MEDIA_MARKER=/d' .env
  fi
  umount "$T" 2>/dev/null || true
  [ "$stopped" = 1 ] && $DC up -d avrmusic >/dev/null 2>&1 || true
}
trap rollback ERR

echo "==> 1/3 копирую музыку, пока сервис работает ($((need/1024/1024)) МБ)"
start=$(date +%s)
rsync -aH --info=stats1 "$MEDIA/" "$T/"


echo "==> 2/3 короткая остановка: досылаю изменения"
$DC stop avrmusic; stopped=1
rsync -aH --delete "$MEDIA/" "$T/"
src=$(find "$MEDIA" -type f | wc -l); dst=$(find "$T" -type f ! -name "$MARK" | wc -l)
[ "$src" = "$dst" ] || { echo "::error::Файлов на хранилище $dst, а должно быть $src"; false; }
touch "$T/$MARK"
umount "$T"

echo "==> 3/3 подключаю хранилище на место папки с музыкой"
mv "$MEDIA" "$MEDIA-local-old"; swapped=1
mkdir -p "$MEDIA"
grep -q "^$SHARE $MEDIA " /etc/fstab || echo "$SHARE $MEDIA nfs4 $OPTS 0 0" >> /etc/fstab
systemctl daemon-reload
mount "$MEDIA"
[ -f "$MEDIA/$MARK" ]

# after a reboot Docker waits for the share; if the storage was away, the share is mounted again by itself
# (and the app restarted, so it sees the music)
install -d /etc/systemd/system/docker.service.d
printf '[Unit]\nAfter=remote-fs.target\nWants=remote-fs.target\n' > /etc/systemd/system/docker.service.d/avr-storage.conf
cat > /etc/systemd/system/avr-storage-mount.service <<UNIT
[Unit]
Description=AVRmusic: mount the music from the storage server if it is not mounted
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'mountpoint -q $MEDIA || { mount $MEDIA && cd $APP && $DC restart avrmusic; }'
UNIT
cat > /etc/systemd/system/avr-storage-mount.timer <<UNIT
[Unit]
Description=AVRmusic: keep the music mounted
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now avr-storage-mount.timer >/dev/null 2>&1

set_env MEDIA_MARKER "$MARK"
set_env DOWNLOAD_PROXIES "http://10.77.0.2:8888#Польша"
$DC up -d avrmusic
port="$(env_get APP_PORT)"; port="${port:-8080}"
for i in $(seq 1 40); do curl -fsS -m 5 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && break; sleep 3; done
curl -fsS -m 5 "http://127.0.0.1:$port/api/health" >/dev/null
trap - ERR

echo "::notice::Музыка переехала на хранилище за $(( ($(date +%s) - start) / 60 )) мин: $src файлов. Сервис работает, скачивание идёт через оба сервера. Старая копия лежит в $MEDIA-local-old ($(du -sh "$MEDIA-local-old" | cut -f1)) — удалю, когда скажете."
