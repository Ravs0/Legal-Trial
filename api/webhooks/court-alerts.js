import crypto from 'node:crypto';

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

// Bounded raw-body reader (256 KiB cap). Vercel may pre-parse req.body,
// so prefer it when present; otherwise stream it.
const MAX_BODY_BYTES = 256 * 1024;
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const pre = req.body;
    if (typeof pre === 'string') {
      if (Buffer.byteLength(pre, 'utf8') > MAX_BODY_BYTES) {
        const e = new Error('body too large'); e.code = 413; return reject(e);
      }
      return resolve(pre);
    }
    if (pre != null) {
      try {
        const s = JSON.stringify(pre);
        if (Buffer.byteLength(s, 'utf8') > MAX_BODY_BYTES) {
          const e = new Error('body too large'); e.code = 413; return reject(e);
        }
        return resolve(s);
      } catch {
        const e = new Error('bad body'); e.code = 400; return reject(e);
      }
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        const e = new Error('body too large'); e.code = 413;
        reject(e);
        req.destroy?.();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
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

export default async function handler(req, res) {
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
    raw = await readJsonBody(req);
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
