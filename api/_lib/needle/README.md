# Needle sidecar (A13)

## Why sidecar, not request-path

`cactus-needle==3.0.2` is a **local python library** (verified live on system
python3.11, 2026-09-19). Vercel serverless functions are **Node** — they
cannot import it, and bundling a 14MB foundation model + python runtime into
a Hobby-tier function is off the table. So Needle runs as a **build-time /
eval tool + optional offline sidecar**, never in the request path:

1. Offline (dev machine / eval harness / cron): `extract.py` reads stdin
   JSON `{text}`, runs `needle.extract()` locally (~200–1200ms), writes
   stdout JSON.
2. The JSON ships with the eval fixture or drill-turn record.
3. The server consumes that JSON via `schemas.js` (shapes + confidence gate)
   — pure Node, zero new dependencies, zero latency added.

Default = sidecar pattern: **extract offline, ship JSON, server consumes JSON.**

## Honest limits (found live, baked into the design)

- Extraction is **literal** (`case_name:"Miranda"` from "Miranda v. Arizona…"),
  NOT legal reasoning. Needle does extraction + routing of EXPLICIT fields;
  judgment = JEV, prose = LLM.
- Confidence measured **0.25–0.56** on legal tasks → `DEFAULT_THRESHOLD`
  (0.6) sits above that band. Honest note: `needle.extract()` 3.0.2 returns
  only the args dict (engine confidence is discarded), so the LIVE gate is
  strict grounding + the empty/null guards — which escalate on exactly the
  inputs a low score would flag. The numeric `confidence` branch in
  `gateExtraction` is tested standby for when a future Needle version (or
  the agent `run()` flow) exposes a score.
- Counts are NOT extractable: live probe showed `hedge_count: int` trips
  strict grounding validation, and `strict=False` hallucinates (20 for ~3
  hedges). So `hedge_count` is a deterministic regex count in `extract.py`,
  and `cited_any` stays a strict-validated bool.

## I/O contract

```bash
echo '{"text":"In Miranda v. Arizona, 384 U.S. 436 (1966), the Court held that suspects must be warned."}' \
  | python3 api/_lib/needle/extract.py
```

stdout (ok): `{ok, ms, authority|null, authority_status, turn_facts:{cited_any, hedge_count}, cited_status, escalate}`

- `authority` is non-null ONLY when strictly grounded; otherwise
  `authority_status: "ungrounded:*"` and `escalate: true`.
- failure lines: `{ok:false, code, error, escalate}` with
  `code ∈ {BAD_INPUT, EMPTY_TEXT, NEEDLE_MISSING}`.

`schemas.js` `fromSidecar()` maps any `ungrounded:*` status to
`{ok:false, code:"EXTRACTION_UNGROUNDED", escalate:true}` for the chain.
