const crypto = require("crypto");
const { readRawBody } = require("../_lib/security");

const WINDOW_S = 300;
const ALLOWED = new Set([
  "hearing.scheduled",
  "hearing.cancelled",
  "order.issued",
  "filing.deadline",
  "case.status_changed",
]);

// Delivery-ID dedup stub: in-memory only. Swap for Redis/KV in prod.
const seen = new Set();
function isDuplicate(id) {
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 5000) seen.delete(seen.values().next().value);
  return false;
}

function timingEqual(a, b) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb); // hmac.compare_digest equiv.
}

function verifyV2(raw, ts, sig, secret) {
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!ts || !Number.isFinite(skew) || skew > WINDOW_S) return false;
  const msg = `${ts}.${raw}`;
  const expect = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const got = String(sig || "").replace(/^sha256=/i, "").trim();
  if (!got) return false;
  return timingEqual(expect, got);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("method not allowed");
  }
  const secret = process.env.COURT_WEBHOOK_SECRET;
  if (!secret) {
    res.statusCode = 500;
    return res.json({ error: "webhook not configured" });
  }
  let raw;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    res.statusCode = e.code === 413 ? 413 : 400;
    return res.json({ error: "body too large" });
  }
  const ts = req.headers["x-court-timestamp"];
  const sig = req.headers["x-court-signature"];
  if (!verifyV2(raw, ts, sig, secret)) {
    res.statusCode = 401;
    return res.json({ error: "invalid signature" });
  }
  const deliveryId =
    req.headers["x-delivery-id"] || req.headers["x-court-delivery-id"];
  if (isDuplicate(deliveryId)) {
    res.statusCode = 200;
    return res.json({ status: "duplicate", deliveryId });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    res.statusCode = 400;
    return res.json({ error: "invalid json" });
  }
  if (!ALLOWED.has(event.event_type)) {
    res.statusCode = 200;
    return res.json({ status: "ignored", event_type: event.event_type });
  }
  res.statusCode = 202;
  return res.json({ status: "accepted", deliveryId, event_type: event.event_type });
};
