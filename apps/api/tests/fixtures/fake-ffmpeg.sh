#!/bin/bash
# ffmpeg stand-in for tests: answers -version and "encodes" by copying the input to the output path.
in=""; out=""
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  [[ "${args[$i]}" == "-version" ]] && { echo "ffmpeg version fake-7.0"; exit 0; }
  [[ "${args[$i]}" == "-i" ]] && in="${args[$((i+1))]}"
done
out="${args[$((${#args[@]}-1))]}"
[[ -n "$in" && -n "$out" ]] || exit 1
cp "$in" "$out"
exit 0
