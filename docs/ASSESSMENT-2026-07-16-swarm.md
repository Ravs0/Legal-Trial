# Assessment Report — LexForge Multi-Agent Session (2026-07-16)

**Author:** Grok 4.5 orchestrator (this session)  
**Audience:** Product owner + any successor agent/human continuing LexForge  
**Repos:** `Ravs0/Legal-Trial` (LexForge), plus related work on `indic-transcribe-android`  
**Session account (xAI):** `jnukin73@gmail.com`  
**Shipped on `main`:** `17bcbc5` (feature) + `fc0717c` (Vercel hotfix)

This is an **honest retrospective**, not a victory lap. Outcomes were real; process waste and risk were also real.

---

## 1. What was done (outcomes)

### 1.1 Delivered product work

| Area | Outcome |
|------|---------|
| **Dreadler** | Critic/score semantics fixed; multi-world/skin; pressure vocab unified; clearer env failures; enriched worlds/skins; demo CLI; UI ledger/session reset |
| **Trial practice / scoring** | Harder-to-game scoring, phase gates, monochrome standing, better stream abort handling |
| **Research / caselaw / LexIDE** | Input validation, empty/error contracts, gateway hardening, new tests |
| **Drafting / Strategy** | AI error paths, persona ID fixes, memo assembly fallbacks |
| **APIs** | Chat allowlist + SSE caps; caselaw rate/origin; voice probe; shared security helpers |
| **UI shell** | design.md monochrome, progressive disclosure, leave-mode, atoms/a11y polish |
| **Voice / vision** | Graceful no-key voice; honest biometrics (POS real; emotion path not fake-ready) |
| **Media** | 5 stills + `assets/index.ts` (video gen failed upstream) |
| **Tooling** | `.env.example`, GH Actions `check.yml`, expanded tests, critic contract tests, portable test runner |
| **Docs** | `docs/CHANGELOG-2026-07-16.md`, findings under `/tmp/lexforge-agents/findings/` |
| **Transcription (other repo)** | P0/P1 reliability branch `fix/reliability-p0` (local/not necessarily on GitHub main) |

### 1.2 Verification at end of feature work

- Local: `npm test`, `tsc --noEmit`, production `vite build` green  
- GitHub Actions Check: green  
- First Vercel production after big push: **failed** (see §3.2)  
- Hotfix `fc0717c`: Vercel production **Ready** again  

### 1.3 Scale of the session (approximate)

| Metric | Approx. value |
|--------|----------------|
| Grok-pinned implementer spawns (waves 1–3) | **~50–70+** |
| Early non-Grok explore spawns (user rejected) | **~20–26** |
| Findings markdown files | **~72** (`g` / `g2` / `g3` + audits) |
| Feature commit | **147 files**, ~**+20.7k / −5.6k** lines |
| Agent findings disk | ~**1 MB** under `/tmp/lexforge-agents/findings` |

Exact token bills are **not** available in this CLI transcript. Treat costs as **order-of-magnitude high** relative to a focused single-agent patch of the same quality bar.

---

## 2. What went well

1. **User correction was honored** — after “all Grok,” implementers were pinned to `model=grok-4.5` instead of free OpenRouter/FreeModel routes.  
2. **Highest-value domain (Dreadler)** got real correctness fixes, not only cosmetic UI.  
3. **Tests expanded** enough that `npm run check` became a meaningful gate (typecheck + tests + build).  
4. **Deploy failure was diagnosed from real logs** (`/dev/fd/63` process substitution) and fixed quickly with a portable test runner.  
5. **Secrets discipline** — `.env.example` only; no keys committed; no force-push.  
6. **Changelog exists** so successors are not forced to reverse-engineer 147 files from git alone.

---

## 3. What could have been done better

### 3.1 Process & orchestration

| Mistake | Why it hurt |
|---------|-------------|
| **Spawned ~20–26 free/non-Grok explores first** | User explicitly wanted Grok; burned time, context noise, and eroded trust |
| **“30 then 50 agents” taken too literally** | Parallelism without a DAG or ownership map → file thrash, rework, redundant reports |
| **No integration owner until the end** | Conflict-resolver + late tsc fixes; should have been wave-0 with a freeze window |
| **One mega-commit to main** | Harder review, higher blast radius; should have been stacked PRs by module |
| **Pushed to main before proving Vercel** | GH Actions ≠ Vercel; production broke for ~10 minutes of wall clock |
| **Spam of “agent finished” pings** | Poor UX for the human; should batch or silent-drain until rollup |

### 3.2 Technical / deploy

| Mistake | Why it hurt |
|---------|-------------|
| **`npm test` used bash process substitution** | Works on GHA/Linux full env; **fails on Vercel** → production red while CI green |
| **Court-data API flipped `.js` → `.ts`** | Inconsistent with other Vercel Node routes; latent risk even if not the first fail |
| **Huge monorepo-style edit surface in one PR** | Any one bad interaction can be lost in +20k lines |
| **Video assets not delivered** | Imagine video API 503; should have scoped “assets” to stills + retry queue |

### 3.3 Product judgment

| Mistake | Why it hurt |
|---------|-------------|
| **Breadth over depth on some modules** | Strategy/vision got thinner treatment than Dreadler/practice |
| **Agent findings mostly outside the repo** | `/tmp/...` is ephemeral; INDEX not fully in git until changelog |
| **Did not run a full manual smoke of live Dreadler turns with real keys** | Logic fixed in code; live prompt quality still unverified end-to-end |

### 3.4 Token / cost efficiency (subagents)

There is **no precise token meter** in this session log. Qualitatively:

| Pattern | Effect on tokens |
|---------|------------------|
| **N agents each re-reading the same large screens** (`DreadlerArenaScreen` ~2.5k LOC, `StrategyRoom` ~3k+) | Multiplies prompt tokens by N |
| **Overlapping charters** (e.g. UI shell + Home + Landing + styles + atoms) | Same files rewritten multiple times → more completions + more merge tax |
| **Explore then re-implement on Grok** | Double-paid for diagnosis (once free-route, once Grok) |
| **Long findings files + INDEX + FINAL + CHANGELOG** | Useful but expensive if every agent also dumps full file dumps into chat |
| **Background agents completing while human idle** | Context pollution if orchestrator re-summarizes every completion |
| **Parent context loaded with tool spam** | True / no-op loops in wrap-up phase wasted orchestrator tokens |

**Rough mental model for successors:**  
A single deep Grok pass on Dreadler + practice + APIs might cost **O(1)** of the orchestrator budget.  
Spawning **50 general-purpose agents** that each re-ingest large modules can cost **O(20–50×)** that for overlapping work, with diminishing returns after ~8–12 well-scoped owners.

---

## 4. Subagent optimization problems (do not repeat)

### 4.1 Wrong model routing

**Mistake:** Spawning `explore` / unpinned agents under a config that routes explore → free Hy3 / FreeModel.

**Rule for successors:**

```text
IF user says "all Grok" OR "no free":
  ALWAYS pass model = "grok-4.5" (or current Grok default)
  NEVER rely on explore/plan role defaults in ~/.grok/AGENT_ROUTING.md
```

### 4.2 Too many agents, too little ownership

**Mistake:** Wave-3 “increase to 50” without file locks or non-overlapping paths.

**Rule:**

| Max parallel implementers | Condition |
|---------------------------|-----------|
| **4–8** | Distinct file trees (e.g. `dreadler/*`, `api/*`, `services/trial*`, `components/*`) |
| **1–2** | Same hot file (e.g. `DreadlerArenaScreen.tsx`) — serial only |
| **1** | `package.json`, `vercel.json`, `tsconfig` — single owner |

Use a **work queue + file ownership table**, not “spin N because N is big.”

### 4.3 Read-only explores without write-back path

**Mistake:** Many explore agents returned chat-only; only some wrote `/tmp/.../findings`.

**Rule:** Every agent must write a **single** findings path, and the orchestrator merges once — do not re-ask 20 agents to restate.

### 4.4 No pre-deploy matrix

**Mistake:** Trusted `npm run check` locally + GHA without running the **exact** Vercel build constraints (shell features, Python runtime notes, function packaging).

**Rule — mandatory before `push main`:**

1. `npm run check` locally  
2. GHA green  
3. **`npx vercel build` or inspect previous production log patterns**  
4. Avoid bashisms: process substitution, `mapfile`, GNU-only flags when possible  

### 4.5 Merge strategy

**Mistake:** Fast-forward mega-commit straight to `main` after user said “push to main.”

**Better:**

1. Push feature branch  
2. PR (even if self-merge)  
3. Deploy preview  
4. Merge main  

User asked for main; still should have **smoke-deployed preview first**.

### 4.6 Orchestrator self-noise

**Mistake:** Acknowledging every background completion with tool no-ops and short pings.

**Rule:** Drain subagents silently; one rollup when `pending == 0` or on user request.

---

## 5. Mistakes a successor must not repeat (checklist)

Copy this into your session preamble if continuing LexForge:

- [ ] **Do not spawn free-tier agents** if the user demanded Grok.  
- [ ] **Do not spawn 30–50 writers** without ownership; prefer ≤8 implementers.  
- [ ] **Do not let two agents edit** `App.tsx`, `package.json`, or `PracticeArena.tsx` in parallel.  
- [ ] **Do not use process substitution** in npm scripts used by Vercel.  
- [ ] **Do not treat GHA green as Vercel green.**  
- [ ] **Do not commit secrets**; only `.env.example`.  
- [ ] **Do not force-push** `main`.  
- [ ] **Do not leave findings only in `/tmp`** — promote durable notes into `docs/`.  
- [ ] **Do not claim biometrics/voice “work”** without env + runtime proof.  
- [ ] **Do not rewrite Dreadler critic prompts** without re-running `dreadler/test_critic_contract.py` and a live turn smoke.  
- [ ] **Do not expand monochrome redesign** while also rewriting scoring algorithms in the same unreviewed PR if risk must stay low.  
- [ ] **Do not ignore user tone signals** (“all Grok”) — stop and reconfigure immediately (that part was done late but correctly).

---

## 6. Token usage guidance for subagents (practical)

### 6.1 When to use a subagent

| Use a subagent | Do it yourself |
|----------------|----------------|
| Parallel **read-only** audits of disjoint trees | Single-file surgical fix |
| Long test runs / CI log pulls | 5-line config tweak |
| Isolated module implementation with clear interface | Cross-cutting type that touches half the app |

### 6.2 How to prompt cheaply

1. **Pass absolute paths + file list**, not “explore the whole repo.”  
2. Cap output: “max 40 lines findings + patch list.”  
3. Forbid re-listing entire files already in parent context.  
4. One agent = one module + one PR-sized outcome.  
5. Use **worktree isolation** if two writers must run in parallel on the same app.

### 6.3 Suggested wave template (cost-aware)

```text
Wave 0 (orchestrator only): map modules, freeze package.json owner, write plan
Wave 1 (3–5 Grok): Dreadler engine/API, scoring, API security — highest risk
Wave 2 (3–5 Grok): UI shell monochrome, practice UX — after interfaces stable
Wave 3 (1 Grok): integration, tsc/test/vercel, changelog, single commit
```

Target **~10–15 Grok agents max** for a full-module pass of this size — not 50.

### 6.4 Expected waste patterns observed this session

1. **Duplicate Dreadler UI edits** (parent + Dreadler UI agent + worlds agent).  
2. **HomeScreen asset rewires overwritten** by UI shell agent.  
3. **Explore reports discarded** after Grok-only policy.  
4. **INDEX undercounting g3** (20 vs 40+ files) — meta-docs drifted.  
5. **Orchestrator tool thrash** during “agent completed” system spam.

---

## 7. Quality judgment (honest)

| Dimension | Score (1–5) | Note |
|-----------|-------------|------|
| User-goal coverage | **4** | Dreadler + modules + assets + GH + transcription diagnosis |
| Correctness of critical path | **4** | Dreadler critic + deploy fix solid; live E2E not fully proven |
| Process efficiency | **2** | Agent explosion + free-route detour + main-push without Vercel check |
| Token efficiency | **2** | High parallel re-reads and overlapping writers |
| Deploy reliability | **3** | Broke then fixed same day |
| Documentation for successors | **4** | Changelog + this assessment + findings archive |
| Trust / communication | **3** | Recovered after Grok-only demand; over-notified completions |

**Net:** Shipped meaningful product improvements under high waste. A successor can keep the code and **throw away the process**.

---

## 8. Recommended next work (ordered)

1. **Manual smoke** on production: Landing → Setup → Practice → Dreadler multi-world with real `DEEPSEEK_API_KEY` + `DREADLER_STATE_SECRET`.  
2. **Stack small PRs** for any follow-ups (do not open another 147-file bomb).  
3. **Convert remaining TS-only API experiments** to match Vercel Node patterns (prefer `.js` serverless shells).  
4. **Push transcription `fix/reliability-p0`** as a PR if Android work still matters.  
5. **Add a `scripts/vercel-smoke.sh`** that runs the same checks Vercel runs, documented in README.  
6. **Cap agent fan-out** in project `AGENTS.md` if you keep multi-agent workflows.

---

## 9. Pointers

| Artifact | Path |
|----------|------|
| Product changelog | `docs/CHANGELOG-2026-07-16.md` |
| This assessment | `docs/ASSESSMENT-2026-07-16-swarm.md` |
| Agent findings (local machine) | `/tmp/lexforge-agents/findings/` (`INDEX.md`, `FINAL-REPORT.md`) |
| Feature commit | `17bcbc5` |
| Vercel hotfix | `fc0717c` |
| Remote | https://github.com/Ravs0/Legal-Trial |

---

## 10. One-paragraph successor brief

You inherit a LexForge tree where Dreadler scoring semantics, multi-scenario support, practice anti-game scoring, API hardening, monochrome UI, and tests are substantially better, but landed via an over-large multi-agent swarm that wasted tokens, briefly broke Vercel with a bashism, and pushed straight to main. Do **not** re-run 50 agents. Pick one module, pin **Grok only**, own the files, prove **local check + Vercel**, and ship small PRs. Re-read `docs/CHANGELOG-2026-07-16.md` and run `npm run check` before you touch anything.

---

*End of assessment.*
