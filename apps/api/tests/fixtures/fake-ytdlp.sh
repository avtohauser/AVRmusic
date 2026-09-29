#!/bin/bash
# Minimal yt-dlp stand-in for tests: answers --version, search dumps (derived from the query), and "downloads" by copying FAKE_WAV.
args=("$@")
# -J --skip-download <url>: details of one upload (from $FAKE_DETAILS/<id> when a test provides them)
if [[ " ${args[*]} " == *" --skip-download "* ]]; then
  url="${args[${#args[@]}-1]}"; id="${url##*v=}"
  dd="${FAKE_DETAILS:-${TMPDIR:-/tmp}/avr-fake-details}"
  if [[ -f "$dd/$id" ]]; then cat "$dd/$id"; else exit 1; fi
  exit 0
fi
for a in "${args[@]}"; do
  case "$a" in
    https://music.youtube.com/search*) echo '{"entries":[]}'; exit 0;;
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
      if [[ "$q" != *" - "* ]]; then echo '{"entries":[]}'; exit 0; fi   # only "Artist - Title …" queries have results
      artist="${q%% - *}"; full="${q#* - }"; title="${full%% feat.*}"
      feat=""; [[ "$full" == *" feat. "* ]] && feat="${full#* feat. }"
      topic="$title"; [[ -n "$feat" ]] && topic="$title (feat. $feat)"
      gid="$(printf '%s' "$artist|$topic" | md5sum | cut -c1-8)"   # one video per distinct recording
      esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
      # the official audio upload's details, as YouTube Music writes them ("Title · Artist · Guest")
      dd="${FAKE_DETAILS:-${TMPDIR:-/tmp}/avr-fake-details}"; mkdir -p "$dd"
      credits="$(esc "$topic") · $(esc "$artist")"; [[ -n "$feat" ]] && credits="$credits · $(esc "${feat//, / · }")"
      [[ -f "$dd/good-$gid" ]] || printf '{"id":"good-%s","title":"%s","channel":"%s - Topic","duration":181,"description":"Provided to YouTube by Fake Label\\n\\n%s\\n\\n%s\\n\\n℗ 2026 Fake Label"}\n' \
        "$gid" "$(esc "$topic")" "$(esc "$artist")" "$credits" "$(esc "$title")" > "$dd/good-$gid"
      printf '{"entries":[{"id":"live-%s","title":"%s - %s (Live at Arena)","duration":250,"channel":"RandomUploads"},{"id":"good-%s","title":"%s","duration":181,"channel":"%s - Topic","uploader":"%s - Topic"},{"id":"cover-%s","title":"%s (cover)","duration":182,"channel":"Someone"}]}\n' \
        "$gid" "$(esc "$artist")" "$(esc "$title")" "$gid" "$(esc "$topic")" "$(esc "$artist")" "$(esc "$artist")" "$gid" "$(esc "$title")"
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
printf 'AVRFAKE:%s' "$id" >> "$dest"   # different videos → different files, like real downloads
echo "[download] 100% of 1.00MiB"
exit 0
