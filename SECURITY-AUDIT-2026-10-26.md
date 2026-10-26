# LexForge API security audit — 26 October 2026

Scope: `Ravs0/Legal-Trial` @ `e42c6e1` (LexForge), serverless API under `api/` plus the browser callers that own the affected routes. Reviewed locally from a fresh clone; verified with `npm run check` and a new handler-level regression suite.

## Findings and fixes

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | **Forgeable owner identity / IDOR.** `scores` and `drills` treated the bearer token itself as the owner id (`api/_lib/lexforge/scores.js:3-6`, `drills.js:3-6`). `keys` trusted `x-user-id` / `?owner` (`api/keys.js:6-9`). `schedules` trusted a body/query `user_id` (`api/_lib/cron/schedules.js:18,28`). Anyone could read or write another owner's rows by sending their id. | Added HMAC-SHA256 signed anonymous session tokens (`api/_lib/session.js`) minted by `POST /api/lexforge/session`; owner is now the signed `sub`. `keys`, `scores`, `drills`, `schedules` call `requireSession()`. `x-user-id`/`?owner` overrides removed; a session's schedule writes are forced to its own bucket. |
| 2 | High | **Cron authentication was fail-open / leaky.** `cron/drills` returned `200` and ran the job when `CRON_SECRET` was unset; `cron/due` accepted `?secret=` (leaks in logs/referrers); `cron/schedules` had no auth at all and allowed arbitrary `user_id` reads. `drills` also compared the secret with `!==`. | All cron routes now require `CRON_SECRET` (503 when unset, 401 when wrong) and use a constant-time bearer compare (`isServiceRequest`). `due` accepts the header only. `schedules` accepts either a session (own bucket) or the service secret (explicit `user_id`). |
| 3 | Medium | **Unbounded in-memory stores.** `scores`, `drills`, `schedules`, `keys`, and the `due` ledger grew without limit on a warm instance; `schedules` additionally stored an unbounded 256 KiB payload per row. | `api/_lib/boundedStore.js` caps every store by total and per-owner rows; schedule payloads are limited to 4 KiB. |
| 4 | Medium | **Prototype-key dispatch crash.** `?fn=constructor` (lexforge) and `?job=toString` (cron) resolved inherited `Object.prototype` members and called a non-handler, leaving the request without a response. | Dispatcher maps are frozen and resolved with `Object.hasOwn`; non-string keys are rejected. |
| 5 | Medium | **Rate-limit key spoofable off Vercel.** `allowRequest` keyed on the leftmost `X-Forwarded-For` value; a proxy that appends (rather than overwrites) lets the client pick the bucket. `guardrails.requestKey` had the same bug. | `clientIp()` uses the rightmost XFF hop (proxy-appended), then `x-vercel-forwarded-for` / `x-real-ip`; both `allowRequest` and `requestKey` use it. |
| 6 | Low | **Cron error leak.** `cron/drills` returned raw exception text to the caller. | Logs the error server-side, returns `job_failed`. |
| 7 | Low | **Unbounded `/api/migrate` body / no rate limit.** | Added the shared 256 KiB body gate and a per-IP bucket. |
| 8 | Low | **Dreadler rate limit keyed on the proxy socket.** Behind Vercel every caller shared one bucket. | Uses the rightmost XFF hop, like the Node routes. |
| 9 | Low | **Non-constant-time shared-key compare** in the unused `requireKey` middleware. | Uses `timingSafeEqualText`. |
| 10 | Info | **Key endpoint implied storage it did not perform.** It returned a fabricated `vault://` ref and `201` while discarding the key. | Response is now honest (`stored: false`); owner scoping is enforced. A real vault/DB remains a TODO. |

## Client changes

`services/sessionService.ts` mints/caches a session in `localStorage` and retries once on `401`. `KeysScreen`, `SchedulesScreen`, and `ApiConsoleScreen` now send the session bearer on owner-scoped routes. Practice/hearing traffic (`/api/lexforge/chain`) is unchanged.

## Verification

- `npm run check` — function budget (12/12), `tsc --noEmit`, all TS/Python tests, production build: **green**.
- **CI gate fixed:** the gateway freshness check used file mtimes; a clean checkout writes the TS after the compiled JS, so GitHub Actions failed regardless of content. It now recompiles with the pinned esbuild and compares bytes (`cmp`). GitHub Actions on the PR is green.
- `services/apiSecurity.test.ts` — **8/8**:
  - valid/tampered/expired session tokens;
  - raw bearer and `x-user-id` no longer authenticate;
  - cross-owner score/key/schedule reads and deletes are blocked;
  - schedules body `user_id` cannot escape the session;
  - cron routes fail closed and ignore `?secret=`;
  - rightmost-XFF parsing;
  - bounded-store eviction;
  - prototype-key dispatcher rejection.
- `npm audit --omit=dev` — 0 vulnerabilities.

## Residual risks (not fixed here)

- Stores are still process-global; a new serverless instance starts empty and a session may lose its rows. A durable DB/KV is the real fix.
- `/api/chat`, `/api/voice`, `/api/search`, `/api/caselaw`, and `/api/lexforge/chain` are public and spend provider quota; per-IP buckets are the only cost control. Add a global daily budget or require sessions if abuse appears.
- `webhooks/court-alerts` dedupe is per-instance; a replay hitting a different instance is accepted (the handler only acknowledges today).
- `services/interviewRunner.ts` uses `new Function` for template expressions. It is currently unused; if user-authored interview templates are added, replace it with a restricted evaluator.
- `api/_lib/guardrails.js` `blocklistCheck` is unused and incomplete (no DNS rebinding, decimal/hex IPs, redirect checks). Wire it only with a hardened resolver, or remove it.

## Deployment notes

- Set `CRON_SECRET` in Vercel (cron jobs now fail closed without it).
- Set `LEXFORGE_SESSION_SECRET` in production (32+ random chars). Without it, the fallback is per-process, matching the existing per-instance stores but invalidating sessions on a cold start.
- No new routed function: the session endpoint rides the existing `/api/lexforge/:fn` rewrite.
