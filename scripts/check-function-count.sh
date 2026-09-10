#!/bin/bash
# Serverless function budget guard.
#
# Vercel counts every non-underscore runtime file under /api as a Serverless
# Function. Hobby plans allow at most 12 per deployment; exceeding the cap
# fails the REMOTE build ("Deployment has failed" ~1 min after push, at the
# "Deploying outputs" stage) while local builds and CI stay green — so it is
# checked here instead.
#
# Conventions that keep us within budget:
#   - one file = one function; sibling routes get merged behind a
#     /api/<group>/[...slug].js dispatcher (still counted as 1);
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

if [ "$N" -gt "$LIMIT" ]; then
  echo
  echo "FAIL: $N functions exceed the $LIMIT allowed on this Vercel plan."
  echo "The remote deploy will fail after a green local build. Fix by merging"
  echo "sibling routes behind one [...slug].js dispatcher, or by moving shared"
  echo "code into api/_lib/ (underscore-prefixed = not a function)."
  exit 1
fi
echo "OK: within the Vercel function budget."
