import { allowRequest, enforceBodyLimit } from './_lib/security.js';

// POST /api/migrate — bulk upsert; server-wins on conflict.
// NOTE: server persistence (api/lib/db.js) has not landed yet, so this
// endpoint validates the envelope and returns 501 until wired. It must
// never 500 on Vercel from a missing module import.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!allowRequest(req, { limit: 30, windowMs: 60_000, keyPrefix: "migrate:" }))
    return res.status(429).json({ ok: false, error: "Too many requests. Please wait a minute and try again." });
  if (!enforceBodyLimit(req, res)) return;
  const { version, savedAt, payload } = req.body ?? {};
  if (typeof version !== "number" || !savedAt || typeof payload !== "object" || !payload)
    return res.status(400).json({ ok: false, error: "Bad envelope {version,savedAt,payload}" });
  return res.status(501).json({ ok: false, error: "Migration store not configured yet" });
}
