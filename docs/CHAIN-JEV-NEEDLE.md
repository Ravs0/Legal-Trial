# Chain architecture — JEV + Needle into LexForge (2026-09-19)

Owner: B19. This file is the canonical chain reference. Code truth lives in
`api/_lib/lexforge/chain.js` (A14), `api/_lib/jev/` (A11/A12), `api/_lib/needle/` (A13).
Contract: `~/jarvis/TEAM-CONTRACT-JEV-NEEDLE.md` (main session owns it — quoted, never re-derived here).

## 1. Sequential early-exit diagram (text)

```
drill turn transcript (pinned excerpt, NOT whole session)
  │
  ▼
[Needle-extract]  explicit fields only, free, local/sidecar
  │  Authority{case_name, citation, proposition} · TurnFacts{cited_any, hedge_count}
  │  on EXTRACTION_UNGROUNDED → escalate, never invent
  ▼
[ONE batched JEV step]  after the local heuristic
  │  (one provider round-trip; the heuristic is already available locally)
  │  Choice / Score / Noul questions, single call (11.5x cheaper than sequential)
  ▼
[confidence gate]
  │── pass → early exit: score = 0.3·heuristic + 0.7·jev → {score, dimensions, voters, decision}
  └── fail → [LLM judge] → final blend 0.3·h + 0.7·llm, jev kept as voter
```

What NEVER happens: concurrent-everything fan-out; Needle doing judgment;
LLM prose running before the gate; blocking drills on a missing JEV key.

## 2. Cost math per turn (target ~$0.0001)

JEV price: $0.042/M input tokens, output free. Latency 70–500 ms.
Per-turn budget assumes a pinned transcript excerpt of ~500 input tokens:

| step | cost basis | per-turn cost |
|---|---|---|
| Needle extract | $0, local python | $0 |
| JEV, one batched call (~500 tok) | 500 × $0.042/1e6 | ~$0.00002 |
| LLM judge, runs on ~20% of turns only | ~$0.0004 when run | ~$0.00008 amortized |
| **average drill turn** | | **~$0.0001** |

Levers if the average drifts: shrink the pinned excerpt (JEV state budget is ~32k —
we use a fraction; smaller excerpt = linear savings), batch all questions in ONE
call (never sequential JEV calls), raise the gate threshold so the LLM runs less
often (trades cost for abstention rate — calibrate, don't guess).

## 3. Confidence gates (every handoff, same abstain philosophy as score.js)

- `JEV_CONF_THRESHOLD = 0.6` (configurable per-call via `input.threshold`).
- `ABSTAIN_GAP = 0.3`, weights `W_H = 0.3`, `W_JEV = 0.7`, `W_LLM = 0.7` (score.js parity).
- Gate fires when JEV confidence < threshold OR |heuristic − JEV| > 0.3 → `human_review`.
- Low-confidence gate is sticky → stays `human_review`. Gap-only gate clears to
  `auto` if the LLM agrees with the heuristic within the gap.
- JEV `route_turn: human_review` or a `needs_escalation`/`thin_answer` Noul
  probability ≥ 0.5 is sticky `human_review` and skips the LLM spend.
- A Needle sidecar failure or ungrounded field is also sticky `human_review`
  and stops provider work before the JEV call.
- Chain returns `{score, dimensions, voters:[heuristic, jev, llm?], decision,
  usage:{jevTokens, llmSkipped}}` so every skip/escalation is auditable.
- Below threshold → escalate, never invent. Chain v2 extends `score.js`, does not fork it.

## 4. Sidecar rationale (Needle NOT in the request path)

Needle (`cactus-needle==3.0.2`) is a LOCAL python lib on system python3.11;
Vercel functions are Node and cannot import it. Verified live limits: extraction
is literal (quotes what the text says, no legal reasoning), tool-call path
returns empty args on complex prompts, confidence 0.25–0.56 on legal tasks.
Therefore:

- Needle does extraction + routing of EXPLICIT fields, never judgment. Judgment = JEV. Prose = LLM.
- Default = sidecar pattern: extract offline (`extract.py` reads stdin JSON
  `{text}`, writes stdout JSON), ship JSON, server consumes JSON.
- Also used as a build-time/eval tool. A13 owns the decision; this doc records it.

## 5. Mock discipline (no live key this session)

- Every JEV test runs against a mock server/harness shape-verified from public
  docs (Choice ≤255 options + distribution + confidence; Score 2–10 levels +
  weighted score + confidence; Noul yes/no probability 0..1, NO confidence field).
- Live test = ONE documented command, run ONLY when `TYPESAFE_API_KEY` is set.
  No key → mocks only, never a skipped test suite pretending to pass.
- Needle tests run live-local (free, local lib — no excuse for mocking it).
- `@typesafe-ai/sdk` vs direct fetch: A11 decides, exactly one integration.
  Until then the default JEV path is a single batched `fetch` to
  `POST https://api.typesafe.ai/v1/systemone`.

## 6. Key handling (non-negotiable)

- `TYPESAFE_API_KEY` from env only. Never argv, chat, logs, or responses.
  Writers scrub `sk-`/`ts-` shapes.
- Missing key = degraded mode with a stable `chain-degraded` code;
  heuristic + LLM path continues. The chain route returns `human_review` (HTTP
  202); the standalone JEV adapter returns `503`. Never block drills on JEV
  absence, never crash.

## 7. Eval table (`evals/chain/`, harness owned by A18)

Gold sets: `evals/gold/counsel-intake.json`, `evals/gold/judge-issue-spot.json`.
Chain adds `evals/chain/`.

| fixture | gate path exercised | expected decision | cost assertion |
|---|---|---|---|
| clean turn, JEV conf ≥ 0.6, gap ≤ 0.3 | early exit, `llmSkipped:true` | `auto` | JEV-only (~$0.00002) |
| low JEV confidence (< 0.6) | LLM runs, sticky | `human_review` | LLM cost recorded in `usage` |
| heuristic↔JEV gap > 0.3, LLM agrees w/ heuristic | gap gate, clears | `auto`, jev kept as voter | LLM cost recorded |
| heuristic↔JEV gap > 0.3, LLM disagrees | gap gate, holds | `human_review` | LLM cost recorded |
| no `TYPESAFE_API_KEY` | degraded `chain-degraded` | heuristic+LLM, honest 503 code path | JEV $0, never crash |
| ungrounded Needle field | `EXTRACTION_UNGROUNDED`, escalate | `human_review` | $0 (local) |
