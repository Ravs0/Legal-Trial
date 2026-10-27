#!/usr/bin/env node
// Print a learner token for the Open Instinct bridge (GET /api/lexforge/agent?t=...).
// Usage: LEXFORGE_AGENT_KEY=... node scripts/agent-token.mjs <learner-id>
// The learner id is opaque (A-Z a-z 0-9 _ -, up to 64): never a phone number or email.
import { learnerToken } from "../api/_lib/lexforge/agent.js";

const learner = process.argv[2];
if (!learner) {
  console.error("usage: LEXFORGE_AGENT_KEY=... node scripts/agent-token.mjs <learner-id>");
  process.exit(1);
}
try {
  console.log(learnerToken(learner));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
