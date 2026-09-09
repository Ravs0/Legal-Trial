// POST /api/migrate — bulk upsert in one transaction; server-wins on conflict.
import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const { version, savedAt, payload } = req.body ?? {};
  if (typeof version !== "number" || !savedAt || typeof payload !== "object" || !payload)
    return res.status(400).json({ ok: false, error: "Bad envelope {version,savedAt,payload}" });
  const records = (Array.isArray(payload) ? payload : Object.entries(payload)
    .flatMap(([col, rows]) => (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r, _col: col }))));
  try {
    const out = await db.transaction(async (tx) => {
      let applied = 0; const conflicts = [];
      for (const r of records) {
        const cur = r.id ? await tx.find(r._col, r.id) : null;
        if (cur && (cur.updatedAt ?? "") > (r.updatedAt ?? "")) { conflicts.push(cur); continue; }
        await tx.upsert(r._col, r); applied++;
      }
      return { applied, conflicts };
    });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
