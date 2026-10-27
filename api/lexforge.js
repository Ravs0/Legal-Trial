// api/lexforge.js — consolidated LexForge API dispatcher (single literal file).
// Implementations live in api/_lib/lexforge/* (not routed separately) so the
// deployment stays within the Vercel function budget. vercel.json rewrites map
// the public URLs onto this handler with the endpoint name as a query param:
//   /api/lexforge/drills -> /api/lexforge?fn=drills
//   /api/lexforge/scores -> /api/lexforge?fn=scores
//   /api/lexforge/chain -> /api/lexforge?fn=chain
//   /api/lexforge/jev-decide -> /api/lexforge?fn=jev-decide
//   /api/lexforge/agent -> /api/lexforge?fn=agent (Open Instinct bridge, server-to-server)
// (Dynamic [..slug].js filenames do NOT create routes on no-framework Vercel
// projects — only literal files do — hence this mapping.)
// New endpoints ride the existing vercel.json /api/lexforge/:fn rewrite —
// they are LAZY imports (chain/jev modules owned by A14/A11 may not exist
// yet; absent module => 503 chain-degraded, never a crash). drills/scores
// stay static: byte-identical behavior.
import drills from "./_lib/lexforge/drills.js";
import scores from "./_lib/lexforge/scores.js";
import agent from "./_lib/lexforge/agent.js";
import { applyCors, allowRequest, enforceBodyLimit, clientError } from "./_lib/security.js";
import { jevBudget, keyQuota } from "./_lib/guardrails.js";

const ENDPOINTS = { drills, scores, agent };

async function loadChain() {
  try {
    const m = await import("./_lib/lexforge/chain.js");
    const fn = m.default || m.chain || m;
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

async function loadJevDecide() {
  for (const p of ["./_lib/jev/decide.js", "./_lib/jev/client.js"]) {
    try {
      const m = await import(p);
      const fn = m.default || m.decide || m;
      if (typeof fn === "function") return fn;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export default async function handler(req, res) {
  const seg = req.query?.fn;
  const name = Array.isArray(seg) ? seg[0] : seg;
  if (name === "chain" || name === "jev-decide") {
    if (!applyCors(req, res, "POST, OPTIONS", "Content-Type, Authorization, X-Api-Key, X-LexForge-Key")) {
      return res.status(403).json(clientError("Origin is not allowed."));
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method not allowed" });
    }
    if (!enforceBodyLimit(req, res)) return;
    if (!allowRequest(req, { limit: 30, windowMs: 60_000, keyPrefix: "lexforge:" })) {
      return res.status(429).json(clientError("Too many requests. Please wait a minute and try again."));
    }
    let passed = false;
    keyQuota(req, res, () => { passed = true; });
    if (!passed) return;
    passed = false;
    jevBudget(req, res, () => { passed = true; });
    if (!passed) return;
    const fn = await (name === "chain" ? loadChain() : loadJevDecide());
    if (!fn) return res.status(503).json({ error: "chain-degraded", fn: name });
    return fn(req, res);
  }
  const fn = ENDPOINTS[name];
  if (!fn) return res.status(404).json({ error: "unknown endpoint" });
  return fn(req, res);
}
