# TrialSim — Mock Trial Simulator

An AI-driven mock-trial and legal-practice simulator. Argue cases against AI
judges and opposing counsel, get scored, draft legal documents, and refine your
advocacy — across both Indian and International (common-law) practice modes.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```
2. Run the app:
   ```
   npm run dev
   ```
   The dev server starts on http://localhost:3000.

> **Note:** In local development the `/api/*` serverless functions only run on
> Vercel. To exercise AI features locally, use `vercel dev`. The app degrades
> gracefully and surfaces a clear error if the AI service is unreachable.

## Deploy (Vercel)

The app is built for Vercel out of the box. AI calls are proxied through
`/api/*` serverless functions that hold the model keys — **the client never
needs (and never asks the user for) an API key.**

Add these to your Vercel project's **Environment Variables** (Project Settings →
Environment Variables):

| Variable | Required | Used by | Description |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | **Yes** | `/api/chat`, `/api/call` | Powers all chat, judge, opposing-counsel, drafting, and performance analysis. |
| `SARVAM_API_KEY` | Optional | `/api/voice` | Enables speech-to-text (mic input) and text-to-speech ("Read Aloud"). Without it, voice features are disabled. |

Then deploy:
```
vercel --prod
```

## How the AI layer works

- All model requests go through `POST /api/chat` (chat + streaming) or
  `POST /api/call` (single-shot). See `api/`.
- These functions read `DEEPSEEK_API_KEY` server-side and forward to DeepSeek's
  Chat Completions API. No key is ever exposed to the browser.
- If the key is missing or the upstream fails, the API returns a `50x` and the
  UI shows a clear "AI service unavailable" message. There is **no silent mock
  fallback** — what you see is always the real model.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (via CDN)
- DeepSeek (chat / reasoner) for AI
- Sarvam AI for voice (STT + TTS)
