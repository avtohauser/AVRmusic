#!/usr/bin/env bash
# Main server: move the music (MEDIA_PATH: tracks, covers, canvases…) to the storage server and mount it
# back in the same place, so the app and its database see the same paths. Runs as its own systemd unit
# (avr-migrate), so a dropped connection cannot leave it half done. Copied with rsync over SSH through the
# tunnel while the app runs (what is there already is skipped), then the app stops for the last changes
# only. Any failure puts everything back as it was. The local copy is kept (…/media-local-old) until it
# is removed on purpose. Progress: /root/avr-storage/status; the outcome: /root/avr-storage/result.
set -euo pipefail
APP=/opt/avrmusic
DIR=/root/avr-storage
cd "$APP"
stage() { echo "$*" > "$DIR/status"; echo "==> $*"; }
result() { echo "$*" >> "$DIR/result"; }
: > "$DIR/result"
env_get() { (grep "^$1=" .env || true) | head -n1 | cut -d= -f2-; }
set_env() { if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi; }
MEDIA="$(env_get MEDIA_PATH)"; MEDIA="${MEDIA:-/srv/avrmusic/media}"
SHARE=10.77.0.2:/srv/storage/media
REMOTE=root@10.77.0.2
RDIR=/srv/storage/media
MARK=.avr-storage
OPTS=rw,soft,timeo=150,retrans=3,_netdev,nofail,x-systemd.requires=wg-quick@avr0.service
DC="docker compose -f docker-compose.prod.yml"
SSHC="ssh -i /root/.ssh/avr_storage -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/avr_known_hosts -o ServerAliveInterval=30"

if grep -q " $MEDIA nfs" /proc/mounts && [ -f "$MEDIA/$MARK" ]; then stage "готово"; result "::notice::Музыка уже на хранилище — переносить нечего"; exit 0; fi
ip link show avr0 >/dev/null 2>&1 || { result "::error::Туннель к хранилищу не поднят — сначала шаг setup"; exit 1; }
# what an interrupted earlier try may have left: its copy mount; the music folder half swapped; the app stopped
umount -l /mnt/avr-store 2>/dev/null || true
if [ -d "$MEDIA-local-old" ] && ! mountpoint -q "$MEDIA"; then
  rmdir "$MEDIA" 2>/dev/null || true
  [ -e "$MEDIA" ] || mv "$MEDIA-local-old" "$MEDIA"
fi
$DC up -d avrmusic >/dev/null
$SSHC "$REMOTE" true || { result "::error::Основной сервер не входит на хранилище по ключу"; exit 1; }

need=$(du -sb "$MEDIA" | cut -f1)
avail=$($SSHC "$REMOTE" "df --output=avail -B1 $RDIR | tail -1")
have=$($SSHC "$REMOTE" "du -sb $RDIR | cut -f1")
if [ "$need" -gt $((avail + have - 2*1024*1024*1024)) ]; then result "::error::На хранилище не хватает места: нужно $((need/1024/1024/1024)) ГБ"; exit 1; fi

stopped=0; swapped=0
rollback() {
  result "::error::Перенос прерван на этапе «$(cat "$DIR/status")» — всё возвращено как было"
  if [ "$swapped" = 1 ]; then
    umount "$MEDIA" 2>/dev/null || umount -l "$MEDIA" 2>/dev/null || true
    sed -i "\\#^$SHARE $MEDIA #d" /etc/fstab
    rmdir "$MEDIA" 2>/dev/null || true
    [ -d "$MEDIA-local-old" ] && mv "$MEDIA-local-old" "$MEDIA"
    sed -i '/^DOWNLOAD_PROXIES=/d; /^MEDIA_MARKER=/d' .env
  fi
  [ "$stopped" = 1 ] && $DC up -d avrmusic >/dev/null 2>&1 || true
}
trap rollback ERR

start=$(date +%s)
stage "1/3 копирование, сервис работает: на хранилище $((have/1024/1024/1024)) из $((need/1024/1024/1024)) ГБ"
# (24: a file vanished while the app ran — the second pass sorts that out)
rsync -aH --partial --info=stats1 -e "$SSHC" "$MEDIA/" "$REMOTE:$RDIR/" || { rc=$?; [ "$rc" = 24 ] || false; }
copy_min=$(( ($(date +%s) - start) / 60 ))

stage "2/3 короткая остановка: досылаю изменения"
$DC stop avrmusic; stopped=1
rsync -aH --delete -e "$SSHC" "$MEDIA/" "$REMOTE:$RDIR/"
# every file of the music must be on the storage as it is here (a stray extra file there harms nothing)
left=$(rsync -aHn --itemize-changes -e "$SSHC" "$MEDIA/" "$REMOTE:$RDIR/" | grep -c '^<f' || true)
[ "$left" = 0 ] || { result "::error::После досылки на хранилище не совпадают $left файлов"; false; }
src=$(find "$MEDIA" -type f | wc -l)
dst=$($SSHC "$REMOTE" "find $RDIR -type f ! -name $MARK | wc -l")
$SSHC "$REMOTE" "touch $RDIR/$MARK"

stage "3/3 подключаю хранилище на место папки с музыкой"
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
stage "готово"
result "::notice::Музыка на хранилище: $src файлов, $((need/1024/1024/1024)) ГБ (копирование $copy_min мин, остановка сервиса $(( ($(date +%s) - start) / 60 - copy_min )) мин). Сервис работает, скачивание идёт через оба сервера. Старая копия: $MEDIA-local-old ($(du -sh "$MEDIA-local-old" | cut -f1)) — удалю, когда скажете."
