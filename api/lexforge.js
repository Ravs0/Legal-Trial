// api/lexforge.js — consolidated LexForge API dispatcher (single literal file).
// Implementations live in api/_lib/lexforge/* (not routed separately) so the
// deployment stays within the Vercel function budget. vercel.json rewrites map
// the public URLs onto this handler with the endpoint name as a query param:
//   /api/lexforge/drills -> /api/lexforge?fn=drills
//   /api/lexforge/scores -> /api/lexforge?fn=scores
// (Dynamic [..slug].js filenames do NOT create routes on no-framework Vercel
// projects — only literal files do — hence this mapping.)
import drills from "./_lib/lexforge/drills.js";
import scores from "./_lib/lexforge/scores.js";

const ENDPOINTS = { drills, scores };

export default async function handler(req, res) {
  const seg = req.query?.fn;
  const name = Array.isArray(seg) ? seg[0] : seg;
  const fn = ENDPOINTS[name];
  if (!fn) return res.status(404).json({ error: "unknown endpoint" });
  return fn(req, res);
}
