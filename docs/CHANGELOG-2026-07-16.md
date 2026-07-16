# Changelog — Grok multi-agent logic & UI pass

**Date:** 2026-07-16  
**Branch intent:** `feat/grok-swarm-logic-ui`  
**Orchestrator:** Grok 4.5 (xAI session)  
**Scope:** LexForge (Legal-Trial) full-stack modules, monochrome UI, APIs, media, CI scaffold  

This document is the product-facing changelog for the swarm work. Agent research notes live under `/tmp/lexforge-agents/findings/` (not all committed).

---

## Summary

Large multi-module improvement pass focused on:

1. **Dreadler** simulation correctness and multi-scenario content  
2. **Trial practice scoring** that is harder to game  
3. **Research / drafting / caselaw** service contracts and tests  
4. **API hardening** (CORS, body bounds, model allowlist, safer errors)  
5. **Monochrome design.md UI** across shell and rooms  
6. **Voice / vision honesty** and graceful degradation  
7. **Media assets** and registry  
8. **Local CI scaffold** and `.env.example`  

**Not pushed to origin in this commit session.**  
**Related:** Indic Transcribe Android reliability fixes live on local branch `fix/reliability-p0` in a separate clone (not this repo).

---

## Verification at commit time

| Check | Result |
|-------|--------|
| `npm test` | Pass (15 auto-discovered suites) |
| `tsc --noEmit` | Pass |
| Conflict markers | None |
| Dreadler critic contract (`python3 dreadler/test_critic_contract.py`) | 9/9 pass |

---

## Added

### Configuration & process
- `.env.example` — documented env keys without secrets  
- `.github/workflows/check.yml` — `npm ci` + `npm run check` on push/PR  
- `requirements.txt` / `.python-version` — Dreadler / Vercel Python packaging support  
- `assets/index.ts` — central media registry / screen media map  

### Media
- `assets/court_corridor_night.jpg`  
- `assets/trial_binder_desk.jpg`  
- `assets/logic_diagram_smoke.jpg`  
- `assets/witness_stand_empty.jpg`  
- `assets/strategy_war_room.jpg`  

### Tests
- `dreadler/test_critic_contract.py`  
- `services/analyticsService.test.ts`  
- `services/caselawService.test.ts`  
- `services/lexideService.test.ts`  
- `services/searchService.test.ts`  
- `services/storageService.test.ts`  
- `services/voiceService.test.ts`  
- `utils/markdown.test.ts`  
- `hooks/usePrecedentSearch.test.ts`  

### API surface
- `api/court-data/search.ts` (TypeScript gateway shell; replaces deleted `search.js` where applicable)  
- `components/icons/index.ts`  

### Docs
- `docs/CHANGELOG-2026-07-16.md` (this file)  
- `README.md` updated for multi-world Dreadler + env table  

---

## Changed — Dreadler (priority)

### Engine (`dreadler/`)
- **Critic** evaluates agent factual lies vs grounded facts and player exposures/fallacies (aligned with `state.DELTA`)  
- **Defaults** `world=dreadler_logic`, `skin=dreadler`  
- **State** score history cap; tactics ledger semantics = player fallacies  
- **Spawner** variant dict normalization/validation  
- **Worlds** enriched, pairwise-distinct scenarios (`dreadler_logic`, `missing_alibi`, `silent_vault`)  
- **Skins** distinct voices; consistent variant dict shape (`dreadler`, `prosecutor_vance`, `dr_abernathy`)  
- **Demo CLI** multi-world/skin menus, non-interactive flags, key preflight  

### API (`api/dreadler.py`)
- Allow all registered worlds/skins  
- Pressure: `calm | pressured | desperate | collapsed`  
- Variants include `collapsed`  
- GET returns available worlds/skins/pressure/variants  
- 503 when DeepSeek key missing (clear message)  

### UI (`screens/DreadlerArenaScreen.tsx`)
- Multi-world / multi-skin selection wired to API  
- Player fallacy ledger labels  
- Session end clears state token + reset action  
- Structured 503/429/error messages  
- Monochrome score chrome; openings aligned with skins  

---

## Changed — Practice & scoring

- `services/trialScoring.ts` — negation awareness, real citation/fact co-occurrence, template-thin detection, near-duplicate penalties, phase gates, dimensional feedback  
- `screens/practice/PracticeArena.tsx` — phase transitions, objection basis, monochrome standing, stream abort / stuck typing recovery  

---

## Changed — Research, drafting, strategy

- `services/caselawService.ts`, `courtDataGateway.ts`, `lexideService.ts`, `legalWritingScorer.ts` — validation, integrity caps, safer empty/error contracts  
- LexIDE screens — save feedback, empty/error states  
- `screens/DraftingStudioScreen.tsx` — AI error/retry, empty states  
- `screens/StrategyRoomScreen.tsx` — live persona IDs, jurisdiction, AI error handling, memo assembly fallbacks  
- `screens/CaseLibraryScreen.tsx`, `CourtSourcesScreen.tsx`, `SetupScreen.tsx` — search cancel, monochrome, leave-safe setup  

---

## Changed — APIs

| File | Change |
|------|--------|
| `api/chat.js` | Body bounds, model allowlist, SSE stream safety caps |
| `api/caselaw.js` | Origin isolation, rate limit, safer client errors |
| `api/search.js` | Validation, sanitize |
| `api/security.js` | Shared CORS, rate key prefixes, body limits |
| `api/voice.js` | Status probe, missing-key 503, mime/language harden |
| `api/dreadler.py` | See Dreadler section |

---

## Changed — Services

- `aiService.ts` — drafting helpers, clearer failures  
- `voiceService.ts` — probe, humanized errors, browser TTS fallback  
- `storageService.ts` — shape guards, quota recovery  
- `exportService.ts` — formats/labels  
- `demoSessionService.ts` — denser demo defaults  
- `analyticsService.ts` — privacy-safe events  
- `searchService.ts` — normalize/sanitize results  
- `colorUtils.ts` — monochrome tokens  

---

## Changed — UI / design system

- **design.md monochrome:** Layout nav, RoomChrome, PhotoHero/Tile, Button/Card/Modal, ScoreCard, SessionChip, LoadingSpinner, CommandPalette, ChatMessage  
- Landing / Home progressive disclosure; Labs collapsed by default  
- Geometry wallpaper gated off main canvas  
- `styles.css` + `tailwind.config.cjs` brand tokens  
- Icons monochrome; OversightSpirit route coverage including `/bench`  
- Judges / OpposingCounsel redirect shells → Bench  

---

## Changed — Vision

- Honest biometrics: POS path remains; HSEmotion / mobile stream paths surface not-ready rather than fake success  

---

## Changed — Tooling

- `package.json` — test script auto-discovers `services/**/*.test.ts` and `vision/**/*.test.ts`; optional `lint` = typecheck  
- `vercel.json` — Python / Dreadler packaging notes as needed  
- `.gitignore` — env secrets ignored; assets remain trackable  

---

## Fixed bugs (high signal)

1. Dreadler critic / score semantics contradiction  
2. Pressure vocabulary mismatch (API vs engine)  
3. Dead multi-world/skin content unreachable via API  
4. Opaque DeepSeek missing-key failures  
5. Fallacy ledger mislabeled as agent-deployed  
6. Strategy Council dead persona IDs (selection never highlighted)  
7. OversightSpirit missing `/bench` awareness  
8. Voice mic paths failing hard without SARVAM key  
9. Court Sources stale search races  
10. Leave-mode / session sticky rehydrate edge cases  
11. Writing scorer passive-voice `lastIndex` sticky bug  
12. TypeScript control-flow on drafting helpers  

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEEPSEEK_API_KEY` | Yes | Chat + Dreadler LLM |
| `DREADLER_STATE_SECRET` | Yes for Dreadler | HMAC state tokens |
| `ALLOWED_ORIGINS` | Yes in production | CORS |
| `SARVAM_API_KEY` | Optional | STT/TTS |
| `INDIANKANOON_API_KEY` | Optional | Structured caselaw |

---

## Related work (outside this commit)

### Indic Transcribe Android (`Ravs0/indic-transcribe-android`)
Local branch `fix/reliability-p0` (not pushed):

- Gradle auto-fetch whisper.cpp v1.9.1  
- Model SHA-256 pin + longer download timeout  
- Lazy native load / arm64 messaging  
- Newest-chunk queue during busy inference  
- Mic permission denial UI  

See `/tmp/lexforge-agents/findings/g-transcription-fixes.md` and `g2-transcribe-git.md`.

---

## Agent report archive

Detailed agent findings (not all in git):  
`/tmp/lexforge-agents/findings/` — `g-*.md`, `g2-*.md`, `g3-*.md`, `INDEX.md`, `FINAL-REPORT.md`

---

## Upgrade notes

1. Set `DREADLER_STATE_SECRET` in Vercel if using Deception Arena  
2. Deploy with `vercel` so Python `api/dreadler.py` is available  
3. Local AI: use `vercel dev`, not `npm run dev` alone  
4. New assets increase bundle size; ensure CDN/cache as before  

---

## Known follow-ups

- Video loop assets (Imagine API was 503 during generation)  
- Push GitHub Actions workflow to origin  
- Protect `main` and prefer PRs over direct Deploy Bot commits  
- Push transcription `fix/reliability-p0` when ready  
- Manual smoke of Dreadler multi-scenario turns with live keys  

---

## Hotfix (2026-07-16, post-push)

### Vercel production deploy failure

**Symptom:** Production deployment failed after `17bcbc5` while GitHub Actions Check passed.

**Cause:** `package.json` `test` used bash process substitution (`done < <(find ...)`), which fails on Vercel builders:

```text
bash: line 1: /dev/fd/63: No such file or directory
Error: Command "npm run check" exited with 1
```

**Fix:** Portable `scripts/run-tests.sh` (temp file + `sort -u`, no process substitution). `npm test` now runs that script.

