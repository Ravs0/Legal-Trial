# LexForge Private APIs — Legal-Trial

> Trial-only contract locks. Do not expose these routes publicly.

## Routes

| Route | Purpose | Contract |
|---|---|---|
| POST /api/vault/read | fetch key ref (never raw) | redacted logs |
| POST /api/byok/chat | BYOK chat, header key wins | src: byok>vault>env |
| POST /api/bill/charge | idempotent charge | Idempotency-Key replay |
| POST /api/hooks/intake | signed webhook intake | HMAC-SHA256 verify |
| GET /api/quota/status | quota check | 429 at limit |

## Env vars

| Var | Used by | Note |
|---|---|---|
| KEY_VAULT_URL | vault/read | ref only, never log raw |
| VAULT_TOKEN | vault/read | server-only, redacted |
| BYOK_FALLBACK_KEY | byok/chat | last resort after vault |
| WEBHOOK_SECRET | hooks/intake | HMAC sign + verify |
| IDEMPOTENCY_TTL_S | bill/charge | replay window secs |
| QUOTA_DAILY_LIMIT | quota/status | 429 when used>=limit |

## Fixture contracts (services/privateApi.test.ts)

- keyVault redaction: /key|secret|token|auth/i -> "[REDACTED]".
- byokRouter precedence: header byok > vault > env fallback.
- idempotency: same key replays first body, runs once.
- webhook: timingSafeEqual hex HMAC; tamper/wrong-secret reject.
- quota: HTTP 200 under limit, 429 when used >= limit.

## What NOT to copy

- Never copy raw keys, tokens, or webhook secrets into logs.
- Never copy vault contents into client bundles or eval reports.
- Never copy PII from hooks/intake payloads into docs/tests.
- Never bypass HMAC verify or "temporarily disable" quota 429.
- Never import implementation into contract tests; fixtures only.

## Run

```sh
npx tsx services/privateApi.test.ts
# expect: privateApi passed (5/5)
```

## Trial guardrails

- Additive only: no changes to existing routes or services.
- Keep total of test + doc under 180 lines.
- Redact before logging, verify before processing, replay before re-charge.
- Remove or gate these routes before any public launch.
*Owner: trial harness; review on promotion.*
