#!/bin/bash
# Serverless function budget + routing guard.
#
# Vercel counts every non-underscore runtime file under /api as a Serverless
# Function. Hobby plans allow at most 12 per deployment; exceeding the cap
# fails the REMOTE build ("Deployment has failed" ~1 min after push, at the
# "Deploying outputs" stage) while local builds and CI stay green — so it is
# checked here instead.
#
# Conventions that keep us within budget and correctly routed:
#   - one file = one function; sibling routes get merged behind a single
#     LITERAL dispatcher file (e.g. api/cron.js) whose grouped URLs are mapped
#     with vercel.json rewrites: `/api/cron/:job` -> `/api/cron?job=:job`;
#   - dynamic filenames ([slug].js / [...slug].js) are forbidden: on a
#     no-framework project they deploy but never match a URL (that mistake is
#     what silently broke /api/cron/* and /api/lexforge/* in Sep 2026);
#   - shared helpers live in api/_lib/ (leading underscore = never a function).
#
# Override the cap for other plans: FN_LIMIT=100 npm run check
cd "$(dirname "$0")/.." || exit 1
LIMIT="${FN_LIMIT:-12}"

LIST=$(find api -type f \( -name '*.js' -o -name '*.ts' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' \) \
  | grep -vE '(^|/)_' | grep -v __pycache__ | sort)
N=$(printf '%s\n' "$LIST" | grep -c .)

echo "Serverless functions under api/: $N (limit: $LIMIT)"
printf '%s\n' "$LIST" | sed 's/^/  /'

BRACKETED=$(printf '%s\n' "$LIST" | grep -F '[' || true)
if [ -n "$BRACKETED" ]; then
  echo
  echo "FAIL: dynamic-segment filename(s) under api/:"
  printf '%s\n' "$BRACKETED" | sed 's/^/  /'
  echo "Dynamic routes ([slug]/[...slug]) only work on Next.js projects. On"
  echo "no-framework projects only literal api/<name>.js files create routes —"
  echo "map grouped URLs with vercel.json rewrites instead (see /api/cron/:job)."
  exit 1
fi

if [ "$N" -gt "$LIMIT" ]; then
  echo
  echo "FAIL: $N functions exceed the $LIMIT allowed on this Vercel plan."
  echo "The remote deploy will fail after a green local build. Fix by merging"
  echo "sibling routes behind one literal dispatcher file (+ vercel.json"
  echo "rewrite), or by moving shared code into api/_lib/ (underscore-prefixed)."
  exit 1
fi
echo "OK: within the Vercel function budget."
