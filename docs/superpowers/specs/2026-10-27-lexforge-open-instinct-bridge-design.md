# LexForge × Open Instinct Bridge Design

Date: 2026-10-27

## Goal

Let a learner practise LexForge drills by text through a personal agent built on
[Open Instinct](https://github.com/mariagorskikh/open-instinct) (MIT), without
merging the two codebases.

LexForge stays the place where practice is scored and stored. Open Instinct
becomes the channel that brings practice to the learner: one drill by text, one
scored reply back, a short progress line on request.

This extends the growth-pass loop (start fast -> practice -> proof of
improvement -> repeat) to a surface the learner already checks every day.

## Why Not Merge The Repos

- Open Instinct is a long-running Node service, one per person, in a Maritime
  microVM, with a pnpm monorepo, Pi agent loop and Claude as the default model.
- LexForge is a Vite app plus Vercel serverless functions. The routed `api/`
  set is pinned at 12 by `scripts/check-function-count.sh`, and the Hobby cap
  is already full.
- Merging would put a stateful agent runtime inside a stateless deploy and
  break the function-budget contract.

The two talk over HTTP instead: an Open Instinct skill calls a LexForge
endpoint that rides the existing `/api/lexforge/:fn` rewrite.

## Ideas Taken From Open Instinct

| Open Instinct | LexForge form | Phase |
|---|---|---|
| Text the agent | Practice by text: drill -> answer -> score | 1 |
| Skills as playbooks | `integrations/open-instinct/skills/lexforge-coach/SKILL.md` | 1 |
| Policy guard before tools | Every reply carries the LexForge disclaimer; no authority is invented in feedback | 1 |
| Scheduler + daily brief | Daily docket: scheduled drill, court-alert texts from `api/webhooks/court-alerts.js` | 2 |
| Trust tiers + grants | Mentor (reads scorecards), peer (can challenge), stranger (nothing) | 3 |
| Agent-to-agent protocol | Async moots between two learners' agents, judged by LexForge | 3 |
| Sends files | Scorecard / draft as DOCX via `exportService.ts` | 2 |

## Phase 1: Practice By Text

### Endpoint

`POST /api/lexforge/agent` (dispatcher `api/lexforge.js?fn=agent`,
implementation `api/_lib/lexforge/agent.js`). No new routed file.

Auth: server-to-server only, no CORS. Missing `LEXFORGE_AGENT_KEY` -> 503
`agent_not_configured`. Two ways in:

- `GET ?t=<learner token>&action=...` for Open Instinct. Its only HTTP tool,
  `web_fetch`, can GET a public URL but cannot POST or set headers, and skills
  cannot add tools. A token is `<learner>.<hmac>` signed with
  `LEXFORGE_AGENT_KEY` (`scripts/agent-token.mjs`), so it only reaches that
  learner's drills and scores; rotating the key revokes every token.
- `POST` with `Authorization: Bearer <LEXFORGE_AGENT_KEY>` and the learner id
  in the body, for other backends.

All secrets are compared in constant time.

Rate limit: 30 requests per minute per caller, using `allowRequest` from
`api/_lib/security.js`.

Parameters: `action` plus the fields below (query string on GET, JSON body on
POST). The learner id is opaque (`A-Z a-z 0-9 _ -`, up to 64); LexForge never
receives a phone number or email.

| action | extra fields | returns |
|---|---|---|
| `drill` | `mode?` (`indian` \| `international`) | `{ drill: { id, mode, skill, prompt }, reply }` |
| `answer` | `drill_id`, `text` | `{ score, dimensions, feedback[], reply }` |
| `progress` | - | `{ attempts, average, best, weakest, reply }` |

`reply` is a ready-to-send plain-text message (no markdown, under 600
characters) so the skill can forward it unchanged.

### Scoring

`answer` uses the existing deterministic `heuristic()` from
`api/_lib/lexforge/chain.js` so text practice and in-app chain scoring agree.
No LLM call in Phase 1: it is free, fast, works without provider keys and is
fully testable. Feedback is generated from the weakest dimensions.

Answers under 15 words are rejected with a nudge instead of a score.

### Drill Bank

`api/_lib/lexforge/agentDrills.js`: short, text-sized advocacy prompts across
the five scoring dimensions, for Indian and international practice. Prompts ask
for advocacy technique and structure; they do not assert specific statutory
provisions, so they cannot go stale or misstate law.

Next drill = first drill in the requested mode the learner has not attempted,
then the drill for their weakest dimension.

### Storage

In-memory per instance, matching `drills.js` and `scores.js`. Progress can
reset on a cold start; durable storage arrives with the same migration as the
other `api/_lib/lexforge` stubs.

### Open Instinct Skill

`integrations/open-instinct/skills/lexforge-coach/SKILL.md` follows the Agent
Skills format Open Instinct loads. The owner installs it into their agent's
`/data/skills` folder and texts the agent their learner token and LexForge URL,
which it keeps in memory. The skill covers: starting a drill, forwarding the
answer, sending `reply` as is, progress on request, and an optional daily
schedule. Setup steps: `integrations/open-instinct/README.md`.

### Acceptance

- `npm run check` passes, routed `api/` set still matches the pinned 12.
- `services/agentBridge.test.ts` covers: auth (missing env, wrong key, right
  key, forged or swapped tokens), the full GET token loop, drill selection, short-answer rejection, scoring and feedback shape,
  progress after attempts, reply length, disclaimer present.

## Phase 2: Daily Docket (Later)

- Skill schedule: one drill per weekday at the learner's chosen time.
- Court alerts: `api/webhooks/court-alerts.js` forwards status changes for
  followed cases to the learner's agent.
- "Send my scorecard": `exportService.ts` produces DOCX; the agent attaches it.

## Phase 3: Mentors, Peers And Async Moots (Later)

- Roles modelled on Open Instinct tiers: mentor can read scorecards, peer can
  issue a moot challenge, everyone else gets nothing.
- Async moot: two agents exchange submissions over the Open Instinct protocol;
  LexForge scores both with the same judge and returns one result to each.

## Open Questions

- Model on the agent side: Open Instinct defaults to Claude via Pi, LexForge
  uses DeepSeek. Scoring stays inside LexForge, so Phase 1 does not depend on
  this choice.
- Durable storage for learner progress (shared with the existing stubs).
