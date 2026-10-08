#!/usr/bin/env bash
# A failed Gradle build: its compiler errors (and Gradle's own "What went wrong") as annotations on the
# run, so they can be read on the run's page and through the API without opening the whole log.
# GitHub keeps 10 error annotations per step: the first 8 errors get their own, the rest share one.
log="$1"
mapfile -t errs < <(grep -E '^e: ' "$log" | sed -E "s#^e: (file://)?${GITHUB_WORKSPACE:-/nonexistent}/##" | sort -u | head -n 60)
rest=""
for i in "${!errs[@]}"; do
  l="${errs[$i]}"
  if [ "$i" -ge 8 ]; then rest="$rest${l}%0A"; continue; fi
  if [[ "$l" =~ ^([^:]+):([0-9]+):([0-9]+)\ (.*)$ ]]; then
    echo "::error file=${BASH_REMATCH[1]},line=${BASH_REMATCH[2]},col=${BASH_REMATCH[3]}::${BASH_REMATCH[4]}"
  else
    echo "::error::${l#e: }"
  fi
done
if [ -n "$rest" ]; then echo "::error::More errors:%0A$rest"; fi
w="$(grep -A8 'What went wrong' "$log" | head -n 16 | tr '\n' ' ')"
if [ -n "$w" ]; then echo "::error::$w"; fi
