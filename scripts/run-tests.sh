#!/usr/bin/env bash
# Portable test runner for local, GitHub Actions, and Vercel builds.
# Avoids bash process substitution (< <(...)) which fails on some Vercel
# builders with: /dev/fd/N: No such file or directory
set -euo pipefail

ROOTS=(services vision hooks utils)
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

: >"$TMP"
for root in "${ROOTS[@]}"; do
  if [[ -d "$root" ]]; then
    find "$root" -type f -name '*.test.ts' >>"$TMP" || true
  fi
done

if [[ ! -s "$TMP" ]]; then
  echo "No test files found under: ${ROOTS[*]}" >&2
  exit 1
fi

# sort -u for stable order without process substitution
SORTED="$(mktemp)"
trap 'rm -f "$TMP" "$SORTED"' EXIT
sort -u "$TMP" >"$SORTED"

count=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "==> $f"
  tsx "$f"
  count=$((count + 1))
done <"$SORTED"

echo "Ran $count test file(s)"
test "$count" -gt 0
