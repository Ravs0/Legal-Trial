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

echo "Ran $count TS test file(s)"

# Chain integration coverage uses a local mock JEV server and injected LLM
# scorer, so it never needs a live provider key. Keep the Needle sidecar test
# (`evals/chain/integration.test.ts`) as a separate opt-in check because that
# test requires the local cactus-needle Python package. Set SKIP_CHAIN_EVAL=1
# only for environments that forbid loopback listeners.
if [[ "${SKIP_CHAIN_EVAL:-0}" != "1" ]]; then
  if command -v node >/dev/null 2>&1; then
    echo "==> evals/chain/run.js"
    node evals/chain/run.js
  else
    echo "node not found; cannot run chain integration eval" >&2
    exit 1
  fi
else
  echo "SKIP_CHAIN_EVAL=1; skipping chain integration eval"
fi

# Python engine contract tests (Dreadler). Skipped when python3 is absent
# (minimal CI images) — a python failure still fails the gate via exit code.
if command -v python3 >/dev/null 2>&1; then
  for pytest_file in dreadler/test_*.py; do
    [[ -e "$pytest_file" ]] || continue
    echo "==> $pytest_file"
    python3 "$pytest_file"
  done
else
  echo "python3 not found; skipping dreadler contract tests"
fi

test "$count" -gt 0
