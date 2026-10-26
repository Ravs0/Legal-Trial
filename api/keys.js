import { applyCors, allowRequest, clientError, enforceBodyLimit } from './_lib/security.js';
import { requireSession } from './_lib/session.js';
import { capMap, cleanId } from './_lib/boundedStore.js';

// Owner-scoped key metadata. The raw key is intentionally discarded; only the
// provider name and last four characters are kept until a real vault lands.
// Owner identity comes from a signed session token — the old `x-user-id` /
// `?owner` override let any caller read or delete another owner's entries.
const store = globalThis.__lexforgeKeys || (globalThis.__lexforgeKeys = new Map());
const MAX_OWNERS = 2_000;
const MAX_PROVIDERS_PER_OWNER = 20;
const MAX_KEY_CHARS = 4_096;
const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

function scope(owner) {
  if (!store.has(owner)) {
    store.set(owner, new Map());
    capMap(store, MAX_OWNERS);
  }
  return store.get(owner);
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  try {
    const parsed = req.body ? JSON.parse(req.body) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (!applyCors(req, res, 'GET, POST, DELETE, OPTIONS', 'Content-Type, Authorization')) {
    return res.status(403).json(clientError('Origin is not allowed.'));
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!allowRequest(req, { limit: 30, windowMs: 60_000, keyPrefix: 'keys:' })) {
    return res.status(429).json(clientError('Too many requests. Please wait a minute and try again.'));
  }

  const session = requireSession(req, res);
  if (!session) return;
  const owner = session.owner;
  const scoped = scope(owner);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    const keys = [...scoped.values()].map((k) => ({
      provider: k.provider,
      last4: k.last4,
    }));
    return res.status(200).json({ keys });
  }

  if (req.method === 'POST') {
    if (!enforceBodyLimit(req, res)) return;
    const { provider, key } = bodyOf(req);
    const name = cleanId(provider, 64)?.toLowerCase();
    if (!name || !PROVIDER_RE.test(name)) {
      return res.status(400).json(clientError('provider required (letters, digits, dot, dash, underscore)'));
    }
    if (typeof key !== 'string' || key.length < 4 || key.length > MAX_KEY_CHARS) {
      return res.status(400).json(clientError(`key must be 4–${MAX_KEY_CHARS} characters`));
    }
    if (!scoped.has(name) && scoped.size >= MAX_PROVIDERS_PER_OWNER) {
      return res.status(409).json(clientError(`at most ${MAX_PROVIDERS_PER_OWNER} providers per session`));
    }
    const record = {
      provider: name,
      last4: key.slice(-4),
      createdAt: new Date().toISOString(),
    };
    // Never persist or echo the raw key. A real vault write is still a TODO;
    // `stored: false` tells the client not to imply otherwise.
    scoped.set(name, record);
    return res.status(201).json({ ok: true, provider: name, last4: record.last4, stored: false });
  }

  if (req.method === 'DELETE') {
    const provider = cleanId(req.query?.provider || bodyOf(req).provider, 64)?.toLowerCase();
    if (!provider) return res.status(400).json(clientError('provider required'));
    if (!scoped.has(provider)) return res.status(404).json(clientError('not found'));
    scoped.delete(provider);
    return res.status(200).json({ ok: true, provider });
  }

  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
  return res.status(405).json(clientError('Method not allowed'));
}
