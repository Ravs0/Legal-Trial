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

# BSD mktemp (macOS) requires the template to end in Xs, while GNU mktemp
# accepts a suffix after the template. Keep all temporary files portable and
# clean them up on every exit path.
TMP_FILES=()
cleanup_tmp_files() {
  if [ "${#TMP_FILES[@]}" -gt 0 ]; then
    rm -f -- "${TMP_FILES[@]}"
  fi
}
trap cleanup_tmp_files EXIT

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

TS_ROUTED=$(printf '%s\n' "$LIST" | grep -E '\.ts$' || true)
if [ -n "$TS_ROUTED" ]; then
  echo
  echo "FAIL: TypeScript file(s) directly under api/ (routed as functions):"
  printf '%s\n' "$TS_ROUTED" | sed 's/^/  /'
  echo "A .ts endpoint importing .ts broke the remote bundle while local tests"
  echo "stayed green (/api/court-data/search 500, Sep 2026). Routed endpoints"
  echo "must be plain .js importing only .js; compile TS logic into api/_lib/:"
  echo "  ./node_modules/.bin/esbuild services/<x>.ts --platform=node"
  echo "    --format=esm --outfile=api/_lib/<x>.js"
  exit 1
fi

# NOTE: api/_lib/courtDataGateway.js is a compiled copy of
# services/courtDataGateway.ts (plain-JS endpoints cannot import TS without
# breaking the remote bundle). Recompile by hand after editing the TS:
#   ./node_modules/.bin/esbuild services/courtDataGateway.ts --platform=node \
#     --format=esm --outfile=api/_lib/courtDataGateway.js
# Drift is enforced by recompiling with the pinned esbuild and comparing bytes.
# Git checkout does not preserve source/build mtimes or their ordering.

# --- courtDataGateway source/compiled parity (A4) ---
# Silent drift (TS edited, compiled JS not refreshed) previously caused
# prod-only 500s while local tests stayed green, so the gate asserts parity.
TS_SRC="services/courtDataGateway.ts"
COMPILED_JS="api/_lib/courtDataGateway.js"

if [ ! -f "$TS_SRC" ]; then
  echo
  echo "FAIL: gateway TS source missing: $TS_SRC"
  exit 1
fi
if [ ! -f "$COMPILED_JS" ]; then
  echo
  echo "FAIL: gateway compiled JS missing: $COMPILED_JS"
  exit 1
fi

# Filesystem mtimes are not evidence of source drift: Git checkout can write
# the source after the generated JS. The byte comparison below is the gate.

# Export-shape: runtime exports declared in the TS must match compiled JS.
TS_EXPORTS=$(grep -oE '^export (const|function|class) [A-Za-z0-9_]+' "$TS_SRC" | awk '{print $3}' | sort)
JS_EXPORTS=$(sed -n '/^export {/,/^};/p' "$COMPILED_JS" | grep -oE '[A-Za-z0-9_]+' | grep -v '^export$' | sort)
if [ "$TS_EXPORTS" != "$JS_EXPORTS" ]; then
  echo
  echo "FAIL: gateway export-shape drift between $TS_SRC and $COMPILED_JS:"
  TS_EXPORTS_FILE=$(mktemp "${TMPDIR:-/tmp}/lexforge-ts-exports-XXXXXX")
  JS_EXPORTS_FILE=$(mktemp "${TMPDIR:-/tmp}/lexforge-js-exports-XXXXXX")
  TMP_FILES+=("$TS_EXPORTS_FILE" "$JS_EXPORTS_FILE")
  printf '%s\n' "$TS_EXPORTS" >"$TS_EXPORTS_FILE"
  printf '%s\n' "$JS_EXPORTS" >"$JS_EXPORTS_FILE"
  diff "$TS_EXPORTS_FILE" "$JS_EXPORTS_FILE" | sed 's/^/  /' || true
  echo "Recompile the gateway (command in the NOTE above) and re-run this check."
  exit 1
fi
echo "OK: gateway export-shape parity ($(printf '%s\n' "$TS_EXPORTS" | grep -c .) exports)."

# Compile exactly as the checked-in artifact was generated. A successful build
# with different bytes is real drift, even in a branch our sample fixtures miss.
if [ ! -x ./node_modules/.bin/esbuild ]; then
  echo "FAIL: esbuild is required to verify gateway parity (run npm ci)."
  exit 1
fi
FRESH_JS=$(mktemp "${TMPDIR:-/tmp}/gateway-parity-XXXXXX")
TMP_FILES+=("$FRESH_JS")
if ! ./node_modules/.bin/esbuild "$TS_SRC" --platform=node --format=esm --outfile="$FRESH_JS" >/dev/null 2>&1; then
  echo "FAIL: esbuild recompile of $TS_SRC failed."
  exit 1
fi
if ! cmp -s "$FRESH_JS" "$COMPILED_JS"; then
  echo "FAIL: generated gateway drift: $TS_SRC does not match $COMPILED_JS."
  echo "Recompile the gateway (command in the NOTE above) and commit both files."
  exit 1
fi
echo "OK: gateway generated-byte parity."

# --- JEV/Needle chain guards (A19) ---
# Pinned-12: new endpoints go BEHIND api/lexforge.js (?fn=), never as new
#   api/*.js (12/12 Hobby cap is already full; any addition breaks remote).
# No-TS-in-chain: api/_lib/jev|needle *.js must not import '.ts' (plain-JS
#   endpoints cannot import TS without breaking the remote bundle, Sep 2026).
# One-integration: A11 picks exactly one of @typesafe-ai/sdk or direct fetch
#   in _lib/jev/client.js — both or neither is a WARN until that lands.
# No-client-key: TYPESAFE_API_KEY is env-only; any reference under UI-facing
#   dirs (screens/, components/) is a key-leak WARN.

# 1) Pinned literal routed-file set (additions AND removals fail).
JEV_EXPECTED="api/caselaw.js
api/chat.js
api/court-data/search.js
api/cron.js
api/dreadler.py
api/keys.js
api/lexforge.js
api/migrate.js
api/orchestrate.js
api/search.js
api/voice.js
api/webhooks/court-alerts.js"
if [ "$LIST" != "$JEV_EXPECTED" ]; then
  JEV_EXPECTED_FILE=$(mktemp "${TMPDIR:-/tmp}/lexforge-expected-XXXXXX")
  JEV_LIST_FILE=$(mktemp "${TMPDIR:-/tmp}/lexforge-routed-XXXXXX")
  TMP_FILES+=("$JEV_EXPECTED_FILE" "$JEV_LIST_FILE")
  printf '%s\n' "$JEV_EXPECTED" >"$JEV_EXPECTED_FILE"
  printf '%s\n' "$LIST" >"$JEV_LIST_FILE"
  JEV_ADDED=$(comm -13 "$JEV_EXPECTED_FILE" "$JEV_LIST_FILE" || true)
  JEV_REMOVED=$(comm -23 "$JEV_EXPECTED_FILE" "$JEV_LIST_FILE" || true)
  echo
  echo "FAIL: routed api/ file set differs from the pinned 12 (JEV/Needle contract):"
  [ -n "$JEV_ADDED" ] && printf '%s\n' "$JEV_ADDED" | sed 's/^/  added: /'
  [ -n "$JEV_REMOVED" ] && printf '%s\n' "$JEV_REMOVED" | sed 's/^/  removed: /'
  echo "New endpoints go BEHIND api/lexforge.js (?fn=), never as new api/*.js."
  exit 1
fi
echo "OK: routed api/ file set matches the pinned 12."

# 2) No '.ts' imports inside api/_lib/jev/ or api/_lib/needle/ chain code.
for JEV_DIR in api/_lib/jev api/_lib/needle; do
  if [ ! -d "$JEV_DIR" ]; then
    echo "SKIP: $JEV_DIR not present yet (owner agent pending)."
    continue
  fi
  JEV_TSIMP=$(find "$JEV_DIR" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -exec grep -Hn -E "from[[:space:]]+['\"][^'\"]*\.ts['\"]|require\([[:space:]]*['\"][^'\"]*\.ts['\"]" {} + || true)
  if [ -n "$JEV_TSIMP" ]; then
    echo
    echo "FAIL: '.ts' import in $JEV_DIR (plain-JS chain code cannot import TS):"
    printf '%s\n' "$JEV_TSIMP" | sed 's/^/  /'
    exit 1
  fi
done
echo "OK: no '.ts' imports in api/_lib/jev/ or api/_lib/needle/."

# 3) Exactly one JEV integration (SDK xor fetch) — WARN only.
JEV_CLIENT="api/_lib/jev/client.js"
if [ ! -f "$JEV_CLIENT" ]; then
  echo "SKIP: $JEV_CLIENT not present yet (A11 pending)."
else
  JEV_SDK=$(grep -c '@typesafe-ai/sdk' package.json 2>/dev/null || true)
  # The client deliberately supports injected fetch implementations for tests,
  # so detect both direct fetch( and the production fetchFn( call.
  JEV_FETCH=$(grep -vE '^[[:space:]]*//' "$JEV_CLIENT" | grep -cE '(fetch|fetchFn)[[:space:]]*\(' || true)
  if [ "${JEV_SDK:-0}" -gt 0 ] && [ "${JEV_FETCH:-0}" -gt 0 ]; then
    echo "WARN: both @typesafe-ai/sdk (package.json) and fetch( ($JEV_CLIENT) present — exactly one integration (A11 decides)."
  elif [ "${JEV_SDK:-0}" -eq 0 ] && [ "${JEV_FETCH:-0}" -eq 0 ]; then
    echo "WARN: neither @typesafe-ai/sdk nor fetch( in $JEV_CLIENT — exactly one integration required (A11 decides)."
  else
    echo "OK: exactly one JEV integration in $JEV_CLIENT."
  fi
fi

# 4) TYPESAFE_API_KEY must not be referenced under UI-facing dirs — WARN only.
JEV_KEYHITS=""
for JEV_D in screens components src client frontend; do
  if [ -d "$JEV_D" ]; then
    JEV_HIT=$(grep -rn 'TYPESAFE_API_KEY' "$JEV_D" 2>/dev/null || true)
    if [ -n "$JEV_HIT" ]; then
      JEV_KEYHITS="$JEV_KEYHITS$JEV_HIT
"
    fi
  fi
done
if [ -n "$JEV_KEYHITS" ]; then
  printf '%s' "$JEV_KEYHITS" | sed 's/^/WARN: client-side TYPESAFE_API_KEY reference: /'
else
  echo "OK: no TYPESAFE_API_KEY references under UI-facing dirs."
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
