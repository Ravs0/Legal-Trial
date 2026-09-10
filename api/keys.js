import { applyCors, allowRequest, enforceBodyLimit, clientError } from './_lib/security.js';

// Owner-scoped key vault refs. TODO: JWT verify owner + durable vault store.
const store = globalThis.__lexforgeKeys || (globalThis.__lexforgeKeys = new Map());

function ownerId(req) {
  // TODO: JWT verify — derive owner from verified token sub.
  return req.headers['x-user-id'] || req.query.owner || 'trial-owner';
}

function scope(owner) {
  if (!store.has(owner)) store.set(owner, new Map());
  return store.get(owner);
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return req.body ? JSON.parse(req.body) : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json(clientError('Origin is not allowed.'));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!allowRequest(req, { limit: 30, windowMs: 60_000 })) {
    return res.status(429).json(clientError('Too many requests. Please wait a minute and try again.'));
  }
  const scoped = scope(ownerId(req));

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
    if (typeof provider !== 'string' || !provider.trim()) return res.status(400).json(clientError('provider required'));
    if (typeof key !== 'string' || key.length < 4) return res.status(400).json(clientError('key required'));
    const name = provider.trim().toLowerCase();
    const record = {
      provider: name,
      last4: key.slice(-4),
      vaultRef: `vault://${ownerId(req)}/${name}/${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    // Never persist or echo raw key — vault write is external (TODO: integrate).
    scoped.set(name, record);
    return res.status(201).json({ ok: true, provider: name, last4: record.last4, vaultRef: record.vaultRef });
  }

  if (req.method === 'DELETE') {
    const provider = (req.query?.provider || bodyOf(req).provider || '').toString().trim().toLowerCase();
    if (!provider) return res.status(400).json(clientError('provider required'));
    if (!scoped.has(provider)) return res.status(404).json(clientError('not found'));
    scoped.delete(provider);
    return res.status(200).json({ ok: true, provider });
  }
}
