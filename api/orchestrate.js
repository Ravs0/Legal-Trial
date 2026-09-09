import { ALLOWED_ORIGINS } from "./security.js";

const WINDOW_MS = 60_000, LIMIT = 30; // mirrors api/security.js: 30 req/min
const hits = new Map();
const allowOrigin = (o) => !o || ALLOWED_ORIGINS.includes(o) || ALLOWED_ORIGINS.includes("*");
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now); hits.set(ip, arr);
  return arr.length > LIMIT;
}
const frame = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const post = (base, path, body, signal) =>
  fetch(`${base}/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }).then((r) => { if (!r.ok) throw new Error(`${path}:${r.status}`); return r.json(); });

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && allowOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anon").split(",")[0].trim();
  if (limited(ip)) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "rate_limited" }); }
  if (origin && !allowOrigin(origin)) return res.status(403).json({ error: "origin_not_allowed" });

  const { caseId, phase, argument, budgetMs = 55000 } = req.body ?? {};
  if (!caseId || !phase || !argument) return res.status(400).json({ error: "caseId,phase,argument required" });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(Number(budgetMs) || 55000, 55000));
  try {
    frame(res, "turn.start", { caseId, phase, at: Date.now() });
    const base = `https://${req.headers.host}`;
    const payload = { caseId, phase, argument };
    const [counsel, judge, scorer] = await Promise.allSettled([
      post(base, "counsel", payload, ctrl.signal),
      post(base, "judge", payload, ctrl.signal),
      post(base, "scorer", payload, ctrl.signal),
    ]);
    if (counsel.status === "fulfilled") frame(res, "counsel.delta", counsel.value);
    else frame(res, "turn.error", { source: "counsel", message: String(counsel.reason?.message ?? counsel.reason) });
    if (judge.status === "fulfilled") frame(res, "judge.delta", judge.value);
    else frame(res, "turn.error", { source: "judge", message: String(judge.reason?.message ?? judge.reason) });
    if (scorer.status === "fulfilled") frame(res, "score.update", scorer.value);
    else frame(res, "turn.error", { source: "scorer", message: String(scorer.reason?.message ?? scorer.reason) });
    frame(res, "turn.end", { caseId, phase, ok: true });
  } catch (err) {
    frame(res, "turn.error", { source: "orchestrate", message: err?.name === "AbortError" ? "budget_exceeded" : String(err?.message ?? err) });
  } finally {
    clearTimeout(timer); res.end();
  }
}
