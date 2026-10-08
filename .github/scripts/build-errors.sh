#!/usr/bin/env bash
# A failed Gradle build: its compiler errors (and Gradle's own "What went wrong") as annotations on the
# run, so they can be read on the run's page and through the API without opening the whole log.
log="$1"
grep -E '^e: ' "$log" | head -n 25 | sed -E "s#^e: (file://)?${GITHUB_WORKSPACE:-/nonexistent}/##" | while IFS= read -r l; do
  if [[ "$l" =~ ^([^:]+):([0-9]+):([0-9]+)\ (.*)$ ]]; then
    echo "::error file=${BASH_REMATCH[1]},line=${BASH_REMATCH[2]},col=${BASH_REMATCH[3]}::${BASH_REMATCH[4]}"
  else
    echo "::error::${l#e: }"
  fi
done
w="$(grep -A8 'What went wrong' "$log" | head -n 16 | tr '\n' ' ')"
if [ -n "$w" ]; then echo "::error::$w"; fi
