// api/lexforge/[...fn].js — consolidated LexForge API dispatcher.
// Implementations live in api/_lib/lexforge/* (not routed separately) so the
// deployment stays within the Vercel function budget. URLs preserved:
//   /api/lexforge/drills | /api/lexforge/scores
import drills from "../_lib/lexforge/drills.js";
import scores from "../_lib/lexforge/scores.js";

const ENDPOINTS = { drills, scores };

export default async function handler(req, res) {
  const seg = req.query?.fn;
  const name = Array.isArray(seg) ? seg[0] : seg;
  const fn = ENDPOINTS[name];
  if (!fn) return res.status(404).json({ error: "unknown endpoint" });
  return fn(req, res);
}
