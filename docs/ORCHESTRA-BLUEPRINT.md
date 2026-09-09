# LexForge Rebuild Index — Orchestra Blueprint

> Rebuild LexForge from this 39-module batch, top-down. Follow the 6 layers, then build in the 4 phases.

## 1 · Six-layer stack (request flows down, evidence flows up)

```text
┌───────────┐   ┌──────────────┐   ┌────────────┐   ┌─────────┐   ┌──────────┐   ┌─────────┐
│ L1 CLIENT │──▶│L2 ORCHESTRATE│──▶│L3 PERSONAS │──▶│ L4 TOOLS│──▶│ L5 LEDGER│──▶│L6 EVALS │
└───────────┘   └──────────────┘   └────────────┘   └─────────┘   └──────────┘   └─────────┘
       ◀── SSE events / scorecard stream back up ── lifelong loop (ledger → evals → curriculum) ──
```

- **L1 client** — `tray · voice · sse · auth`: shell UI, voice I/O, event stream, identity. Never calls L4/L5 directly.
- **L2 orchestrate** — `orchestrate · router · modes · tiers · workflow · batch · draftPipeline · dreadler · branch · fallback · budget · guardrails · compaction · cron`: plans, routes, budgets, retries. Only layer that may call personas/tools.
- **L3 personas** — `prompts · interview · curriculum · judges`: role behavior, interview scripts, skill curriculum, persona-side grading.
- **L4 tools** — `tools · adapters · providers · ner · rerank · citation · clauses`: stateless, typed I/O, no cross-talk between tools.
- **L5 ledger** — `ledger · schema · migrate · feedback · score · learner`: every mutation and score persisted; learner reads only.
- **L6 evals** — `evals · tests · scorecard · weakness`: grades ledger samples offline; `weakness → curriculum` closes the loop. Never in the request path.

Rules: layers call **down only**; L4 tools are stateless; all L2→L4 effects go through L5; L6 never blocks a live request.

## 2 · Four-phase build order

### Phase 1 — Foundation (contracts, persistence, wire-up)
Goal: boot, auth, persist anything, stream something, test it.
Files: `schema` (db/schema), `migrate` (db/migrate), `providers` (lib/providers), `router` (lib/router), `auth` (lib/auth), `ledger` (lib/ledger), `sse` (lib/sse), `tests` (tests/).
Exit: migration up→down clean, authed request writes one ledger row and streams it over SSE, tests green.

### Phase 2 — Orchestration core (plan, route, survive)
Goal: multi-step runs with budgets, retries, and branching.
Files: `orchestrate` (lib/orchestrate), `modes` (lib/modes), `tiers` (lib/tiers), `budget` (lib/budget), `fallback` (lib/fallback), `guardrails` (lib/guardrails), `workflow` (lib/workflow), `batch` (lib/batch), `branch` (lib/branch), `draftPipeline` (lib/draftPipeline), `dreadler` (lib/dreadler), `tools` (lib/tools), `adapters` (lib/adapters).
Exit: a `workflow` runs end-to-end on a `tiers`/`modes` budget, `fallback`+`guardrails` trip cleanly on forced failure, `branch` merges without ledger forks.

### Phase 3 — Legal intelligence (extract, cite, learn)
Goal: domain quality that compounds via the ledger→eval loop.
Files: `ner` (lib/ner), `rerank` (lib/rerank), `citation` (lib/citation), `clauses` (lib/clauses), `interview` (lib/interview), `curriculum` (lib/curriculum), `weakness` (lib/weakness), `learner` (lib/learner), `feedback` (lib/feedback), `score` (lib/score), `judges` (lib/judges), `prompts` (prompts/), `evals` (evals/), `scorecard` (lib/scorecard).
Exit: cited answer passes `judges`, `feedback`→`score` lands in ledger, `evals`+`scorecard` surface a `weakness` that updates `curriculum`.

### Phase 4 — Surface & ops (ship, speak, schedule, scale)
Goal: user-facing shell plus unattended operation.
Files: `tray` (client/tray), `voice` (client/voice), `cron` (cron/), `compaction` (lib/compaction).
Exit: tray app drives L1→L2 over SSE, voice round-trips, `cron` fires a `batch` run, `compaction` keeps long-run context under budget.

## 3 · What NOT to copy

- Secrets: `.env`, API keys, tokens, certs, `auth.json`-style credential files — reissue, never copy.
- Build artifacts: `node_modules/`, `dist/`, `out/`, `.next/`, caches, logs.
- Machine-local config: absolute paths (`/Users/...`), ports/hostnames baked into code, personal shell or editor state.
- Data dumps: raw client/PII matter, scraped corpora, full crawl JSONs, chat exports — copy schemas and extractors, not the data.
- Stale generated output: old eval reports, scorecards, catalogs — regenerate via Phase 3 instead of trusting them.
- Dead experiments: one-off scripts and duplicate drafts; if it isn't in the 39-module list above, it doesn't get rebuilt.

## 4 · Done criteria

- [ ] Phase exits 1→4 each demonstrated in order, no skipped layers.
- [ ] `tests` + `evals` green; ledger shows the full request→score trail.
- [ ] Fresh clone builds with zero secrets committed and this doc as the only entry point needed.
