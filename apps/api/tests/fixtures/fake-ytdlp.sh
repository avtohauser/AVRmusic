#!/bin/bash
# Minimal yt-dlp stand-in for tests: answers --version, search dumps (derived from the query), and "downloads" by copying FAKE_WAV.
args=("$@")
for a in "${args[@]}"; do
  case "$a" in
    --version) echo "fake-2026.01.01"; exit 0;;
    ytsearch*|scsearch*)
      q="${a#*:}"                       # "Artist - Title feat. X"
      if [[ "$q" == *"Nowhere Track"* ]]; then echo '{"entries":[]}'; exit 0; fi
      if [[ "$q" == *" official video" ]]; then   # canvas lookup: lyric video, official clip, audio-only topic upload
        q="${q% official video}"; artist="${q%% - *}"; title="${q#* - }"
        esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
        printf '{"entries":[{"id":"lyr1","title":"%s - %s (Lyric Video)","duration":183,"channel":"%s","view_count":5000},{"id":"clip1","title":"%s - %s (Official Video)","duration":201,"channel":"%sVEVO","view_count":2500000},{"id":"top1","title":"%s","duration":181,"channel":"%s - Topic"}]}\n' \
          "$(esc "$artist")" "$(esc "$title")" "$(esc "$artist")" "$(esc "$artist")" "$(esc "$title")" "$(esc "$artist")" "$(esc "$title")" "$(esc "$artist")"
        exit 0
      fi
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
ext=wav; for a in "${args[@]}"; do [[ "$a" == "--download-sections" ]] && ext=mp4; done
dest="${out//%(id)s/$id}"; dest="${dest//%(ext)s/$ext}"
cp "$FAKE_WAV" "$dest"
echo "[download] 100% of 1.00MiB"
exit 0
