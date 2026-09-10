// api/lexforge/drills.js — curriculum drills + assign (Legal-Trial, additive).
const A = (global.__lfAssigned ||= []);
function owner(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}
function sec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
}
async function curriculum() {
  if (process.env.CURRICULUM_URL) {
    const r = await fetch(process.env.CURRICULUM_URL);
    return r.json();
  }
  return { drills: [{ id: "irsc-101" }, { id: "irsc-102" }] };
}
export default async (req, res) => {
  sec(res);
  const uid = owner(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  if (req.method === "GET") {
    const data = await curriculum();
    return res.status(200).json(data);
  }
  if (req.method === "POST") {
    const { id, session_id } = req.body || {}; // POST {id}/assign
    if (!id) return res.status(400).json({ error: "id required" });
    const row = { owner: uid, drill_id: id, session_id: session_id || null, ts: Date.now() };
    A.push(row);
    return res.status(201).json({ assignment: row });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
