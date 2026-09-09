// api/lexforge/scores.js — owner-scoped trial scores (Legal-Trial, additive).
const S = (global.__lfScores ||= []);
function owner(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  return t || null; // stub: token = owner id
}
function sec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
}
export default async (req, res) => {
  sec(res);
  const uid = owner(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  if (req.method === "GET") {
    const { session_id, drill_id } = req.query || {};
    const rows = S.filter((r) => r.owner === uid
      && (!session_id || r.session_id === session_id)
      && (!drill_id || r.drill_id === drill_id));
    return res.status(200).json({ scores: rows });
  }
  if (req.method === "POST") {
    const { session_id, drill_id, points } = req.body || {};
    if (!session_id || !drill_id || typeof points !== "number")
      return res.status(400).json({ error: "session_id, drill_id, points required" });
    const row = { owner: uid, session_id, drill_id, points, ts: Date.now() };
    S.push(row);
    return res.status(201).json({ score: row });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
