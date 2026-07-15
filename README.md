# LexForge — AI Legal Skills Platform

An AI-driven mock-trial and legal-practice simulator. Argue cases against AI
judges and opposing counsel, get scored, draft legal documents, and refine your
advocacy — across both Indian and International (common-law) practice modes.

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

> **Note:** `npm run dev` intentionally runs only the Vite UI. In local development,
> the `/api/*` serverless functions run through Vercel. To exercise AI features,
> start the project with `vercel dev`; the app now tells you this directly if the
> endpoint is unavailable.

## Deploy (Vercel)

The app is built for Vercel out of the box. AI calls are proxied through
`/api/*` serverless functions that hold the model keys — **the client never
needs (and never asks the user for) an API key.**

Add these to your Vercel project's **Environment Variables** (Project Settings →
Environment Variables):

| Variable | Required | Used by | Description |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | **Yes** | `/api/chat` | Powers all chat, judge, opposing-counsel, drafting, and performance analysis. |
| `SARVAM_API_KEY` | Optional | `/api/voice` | Enables speech-to-text (mic input) and text-to-speech ("Read Aloud"). Without it, voice features are disabled. |
| `ALLOWED_ORIGINS` | **Yes in production** | API routes | Comma-separated deployed app origins permitted to call the API. |
| `DREADLER_STATE_SECRET` | Required for Dreadler | `/api/dreadler` | Long random secret used to sign the simulation state between turns. |
| `INDIANKANOON_API_KEY` | Optional | `/api/caselaw` | Enables live Supreme Court/High Court case-law retrieval with court and date filters. |

Then deploy:
```
vercel --prod
```

## How the AI layer works

- All model requests go through `POST /api/chat` (chat + streaming). See `api/`.
- These functions read `DEEPSEEK_API_KEY` server-side and forward to DeepSeek's
  Chat Completions API. No key is ever exposed to the browser.
- If a required key is missing or the upstream fails, the API returns a `50x` and the
  UI shows a clear "AI service unavailable" message. There is **no silent mock
  fallback** — what you see is always the real model.

## Live case-law retrieval

Indian live case-law search uses the authenticated Indian Kanoon API. It supports
Supreme Court, all High Courts, selected High Courts, and date filters; it does
not scrape official eCourts portals or bypass their CAPTCHA-protected flows.
Results are research leads, not legal advice: open the linked judgment and verify
the primary source, holding, currency, and citation before relying on it.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (compiled at build time)
- DeepSeek (chat / reasoner) for AI
- Sarvam AI for voice (STT + TTS)
