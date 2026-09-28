#!/bin/bash
# Minimal yt-dlp stand-in for tests: answers --version, search dumps (derived from the query), and "downloads" by copying FAKE_WAV.
args=("$@")
for a in "${args[@]}"; do
  case "$a" in
    --version) echo "fake-2026.01.01"; exit 0;;
    ytsearch*|scsearch*)
      q="${a#*:}"                       # "Artist - Title feat. X"
      if [[ "$q" == *"Nowhere Track"* ]]; then echo '{"entries":[]}'; exit 0; fi
      artist="${q%% - *}"; title="${q#* - }"; title="${title%% feat.*}"
      esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
      printf '{"entries":[{"id":"live1","title":"%s - %s (Live at Arena)","duration":250,"channel":"RandomUploads"},{"id":"good1","title":"%s","duration":181,"channel":"%s - Topic","uploader":"%s - Topic"},{"id":"cover1","title":"%s (cover)","duration":182,"channel":"Someone"}]}\n' \
        "$(esc "$artist")" "$(esc "$title")" "$(esc "$title")" "$(esc "$artist")" "$(esc "$artist")" "$(esc "$title")"
      exit 0;;
  esac
done
out=""; url=""
for ((i=0; i<${#args[@]}; i++)); do
  [[ "${args[$i]}" == "-o" ]] && out="${args[$((i+1))]}"
  [[ "${args[$i]}" == http* ]] && url="${args[$i]}"
done
id="${url##*v=}"
dest="${out//%(id)s/$id}"; dest="${dest//%(ext)s/wav}"
cp "$FAKE_WAV" "$dest"
echo "[download] 100% of 1.00MiB"
exit 0
