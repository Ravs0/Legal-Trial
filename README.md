# LexForge — AI Legal Skills Platform

An AI-driven mock-trial and legal-practice simulator. Argue cases against AI
judges and opposing counsel, get scored, draft legal documents, and refine your
advocacy — across both Indian and International (common-law) practice modes.

**Deception Arena (Dreadler)** is a multi-world logic duel: pick a scenario world
and opponent skin, then pressure-test coherence until the agent collapses or you
do. Server-authoritative scoring uses a signed `state_token`.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```
2. Run the UI-only app:
   ```
   npm run dev
   ```
   The dev server starts on http://localhost:3000.

> **Note:** `npm run dev` runs only the Vite UI. Serverless `/api/*` functions
> run through Vercel. To exercise AI, voice, caselaw, or Dreadler, use
> `vercel dev` (with env vars set). The app surfaces a clear message if an
> endpoint is unavailable.

### Local quality gate

```
npm run check
```

Runs `typecheck` → unit tests → `vite build`. Use this before pushing.

## Deploy (Vercel)

Built for Vercel. AI calls go through `/api/*` serverless functions that hold
model keys. **The client never needs (and never asks the user for) an API key.**

Set these in the Vercel project **Environment Variables**:

| Variable | Required | Used by | Description |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | **Yes** for AI | `/api/chat`, `/api/dreadler` | Chat, judges, counsel, drafting, performance, and Dreadler agent/critic. Aliases: `DEEPSEEK_CHAT_API_KEY` (and reasoner via `DEEPSEEK_REASONER_API_KEY` where used). |
| `DREADLER_STATE_SECRET` | **Yes** for Dreadler | `/api/dreadler` | Long random secret to HMAC-sign simulation state between turns. Missing → 503. |
| `ALLOWED_ORIGINS` | **Yes** in production | All API routes | Comma-separated app origins allowed to call the API. Localhost origins are allowed in dev. Alias: `APP_ORIGIN`. |
| `SARVAM_API_KEY` | Optional | `/api/voice` | STT (mic) and TTS ("Read Aloud"). Without it, voice is disabled. |
| `INDIANKANOON_API_KEY` | Optional | `/api/caselaw` | Structured SC/HC retrieval with provider court/date filters. Without it, public-web discovery only (unverified leads). |

Optional Dreadler/DeepSeek tuning (usually leave default):

| Variable | Description |
|---|---|
| `DEEPSEEK_API_BASE` | Override DeepSeek base URL (default `https://api.deepseek.com`). |
| `DEEPSEEK_STREAM` | Dreadler agent streaming (`true`/`false`, default `true`). |

Then deploy:
```
vercel --prod
```

Vercel `buildCommand` is `npm run check` (see `vercel.json`), so typecheck, tests,
and production build must pass for a deploy to succeed.

## CI

There is **no GitHub Actions workflow** in this repo yet (`.github/workflows` is
empty). Quality is enforced by:

1. **Local / pre-push:** `npm run check`
2. **Vercel deploy:** same `npm run check` as the build command

Add a Actions workflow later if you want PR checks independent of deploys.

## Dreadler (Deception Arena)

Route: `/deception-arena` → `screens/DreadlerArenaScreen.tsx` → `POST/GET /api/dreadler`.

**Worlds** (scenario / grounded facts):

| ID | Title |
|---|---|
| `dreadler_logic` | Dreadler's Logic Arena |
| `missing_alibi` | The Missing Alibi |
| `silent_vault` | The Silent Vault |
| `flatterers_voice` | The Flatterer's Voice (validation trap — the agent agrees with you) |
| `ghost_whisperers` | The Ghost Whisperers (consensus trap — the whole town endorses the lie) |

**Adaptive difficulty (Tier Covenant):** the engine tracks the *player's* skill
(0–100) alongside the agent's coherence. Skill maps to four tiers — Novice,
Adept, Veteran, Devil — gating which of the ten §2.x deceptive tactics the
agent may deploy, its layering limit, and whether it must concede under press.
Player hits raise skill (the world darkens); falling for a trap lowers it;
collapsing a variant jumps +15 so respawns come back harder. Tier crossings
surface as in-fiction notices; the tier chip in the header is player-facing only.

**Skins** (opponent persona):

| ID | Role |
|---|---|
| `dreadler` | Logical interrogator |
| `prosecutor_vance` | Adversarial prosecutor |
| `dr_abernathy` | Forensic examiner |

- `GET /api/dreadler` returns active unlock lists (`worlds`, `skins`, pressure
  levels, variants). The UI only offers unlocked ids; offline default is
  `dreadler_logic` + `dreadler`.
- `POST` with `action: "turn"` runs one engine turn; `action: "reset"` ends the
  signed session lineage on the client path.
- Needs both `DEEPSEEK_API_KEY` and `DREADLER_STATE_SECRET`. Generate the secret
  with `openssl rand -hex 32`. Package lives under `dreadler/`; handler is
  `api/dreadler.py`.

### Dreadler Vercel packaging

| Piece | Location / value |
|---|---|
| Handler | `api/dreadler.py` — `class handler(BaseHTTPRequestHandler)` |
| Engine package | `dreadler/` (repo root; added to `sys.path` by the handler) |
| Prompt asset | `dreadler/full_dreadler_system_prompt.md` (loaded at runtime) |
| Python version | `.python-version` → `3.12` (Vercel default line) |
| Dependencies | Root `requirements.txt` (stdlib-only; no pip packages) |
| Function config | `vercel.json` → `functions["api/dreadler.py"]` (`maxDuration` 120s; frontend/media excluded from the Python bundle) |

Local: `vercel dev` (not bare `npm run dev`) so `/api/dreadler` is served.

## How the AI layer works

- Model requests go through `POST /api/chat` (and Dreadler through `/api/dreadler`).
  See `api/`.
- Functions read DeepSeek keys server-side and forward to DeepSeek Chat
  Completions. No key is exposed to the browser.
- Missing keys or upstream failure return `50x` with a clear UI message. There is
  **no silent mock fallback**.

## Live case-law retrieval

Indian case-law research has two modes. With `INDIANKANOON_API_KEY`, the
authenticated Indian Kanoon API provides structured Supreme Court, High Court,
and date-filtered retrieval. Without that key, the app uses public-web discovery
for judgment links; those results are unverified, and court/date filters are
approximate. The app does not scrape Indian Kanoon's public search pages or
bypass official eCourts CAPTCHA-protected flows. In either mode, results are
research leads, not legal advice: open and verify the primary judgment, holding,
currency, and citation before relying on it.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (compiled at build time)
- DeepSeek (chat / reasoner) for AI
- Sarvam AI for voice (STT + TTS)
- Python serverless Dreadler engine (`dreadler/` + `api/dreadler.py`)
