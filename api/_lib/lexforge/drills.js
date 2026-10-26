// api/_lib/lexforge/drills.js — curriculum drills + assign (Legal-Trial).
//
// Owner identity comes from a signed session token, not an arbitrary bearer
// string. Assignments are capped by total and per-owner size because the store
// is still in-memory until the DB lands. CURRICULUM_URL is server config, but
// the fetch is still bounded so a slow/huge upstream cannot pin the function.
import { applyCors, allowRequest, clientError, enforceBodyLimit } from "../security.js";
import { requireSession } from "../session.js";
import { cleanId, pushBounded, trimOwner } from "../boundedStore.js";

const A = (globalThis.__lfAssigned ||= []);
const MAX_ROWS = 5_000;
const MAX_ROWS_PER_OWNER = 500;
const RATE_LIMIT = 60;
const CURRICULUM_TIMEOUT_MS = 5_000;
const MAX_CURRICULUM_BYTES = 512 * 1024;

function sec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function curriculum() {
  const url = process.env.CURRICULUM_URL;
  if (url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CURRICULUM_TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (r.ok) {
        const raw = await r.text();
        if (raw.length <= MAX_CURRICULUM_BYTES) return JSON.parse(raw);
      }
    } catch {
      /* fall through to the built-in drills */
    } finally {
      clearTimeout(timer);
    }
  }
  return { drills: [{ id: "irsc-101" }, { id: "irsc-102" }] };
}

export default async (req, res) => {
  sec(res);
  if (!applyCors(req, res, "GET, POST, OPTIONS", "Content-Type, Authorization")) {
    return res.status(403).json(clientError("Origin is not allowed."));
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!allowRequest(req, { limit: RATE_LIMIT, windowMs: 60_000, keyPrefix: "drills:" })) {
    return res.status(429).json(clientError("Too many requests. Please wait a minute and try again."));
  }

  const session = requireSession(req, res);
  if (!session) return;
  const uid = session.owner;

  if (req.method === "GET") {
    const data = await curriculum();
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    if (!enforceBodyLimit(req, res)) return;
    const { id, session_id } = bodyOf(req);
    const drillId = cleanId(id, 128);
    if (!drillId) return res.status(400).json({ error: "id required" });
    const row = {
      owner: uid,
      drill_id: drillId,
      session_id: cleanId(session_id, 128),
      ts: Date.now(),
    };
    pushBounded(A, row, MAX_ROWS);
    trimOwner(A, uid, MAX_ROWS_PER_OWNER);
    return res.status(201).json({ assignment: row });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
