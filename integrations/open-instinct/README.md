# LexForge for Open Instinct

Practise LexForge drills by text through a personal agent built on
[Open Instinct](https://github.com/mariagorskikh/open-instinct). The learner
texts "drill", answers by text and gets a LexForge score and one tip back.

Design: [docs/superpowers/specs/2026-10-27-lexforge-open-instinct-bridge-design.md](../../docs/superpowers/specs/2026-10-27-lexforge-open-instinct-bridge-design.md)

## How it fits together

```
learner ──text──> Open Instinct agent ──web_fetch GET──> /api/lexforge/agent ──> drill bank + chain.js heuristic
        <──reply──                    <──JSON {reply}───
```

The agent never scores. LexForge picks the drill, scores the answer and writes
the reply; the `lexforge-coach` skill forwards it unchanged.

## Setup

1. **LexForge (Vercel).** Set `LEXFORGE_AGENT_KEY` to a long random secret in
   the project's environment variables and redeploy. Without it the endpoint
   returns 503.
2. **Token per learner.** Pick an opaque learner id (letters, digits, `_`,
   `-`; never a phone number or email) and run:

   ```bash
   LEXFORGE_AGENT_KEY=... node scripts/agent-token.mjs maria-01
   ```

   A token only reaches its own learner's drills and scores. Rotating
   `LEXFORGE_AGENT_KEY` revokes every token.
3. **Open Instinct.** Copy `skills/lexforge-coach/` into the agent's owner
   skills folder (`/data/skills` on Maritime, `<data>/skills` locally). The
   agent re-reads that folder every 30 seconds.
4. **Learner.** Text the agent: "my LexForge token is `<token>`, my LexForge is
   at `https://<your-domain>/api/lexforge/agent`". It saves both, sends a first
   drill and offers a daily one.

## Server-to-server use

Other backends can skip tokens and POST with the master key:

```bash
curl -X POST https://<your-domain>/api/lexforge/agent \
  -H "Authorization: Bearer $LEXFORGE_AGENT_KEY" -H "Content-Type: application/json" \
  -d '{"action":"drill","learner":"maria-01"}'
```

Actions: `drill` (optional `mode`: `indian` | `international`), `answer`
(`drill_id`, `text`), `progress`.

## Limits

- Progress is in memory per serverless instance, like the other
  `api/_lib/lexforge` stubs, so it can reset on a cold start.
- Scoring is the deterministic `heuristic()` from `api/_lib/lexforge/chain.js`:
  free and consistent, but rougher than the in-app LLM judge.
- 30 requests per minute per caller.
