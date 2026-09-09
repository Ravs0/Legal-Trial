// LexForge Legal-Trial — per-user encrypted key vault (server-only).
// Zero-dep ESM (WebCrypto only). Stores key refs, never raw keys.
// Raw keys live in env UPSTREAM_<PROVIDER>_KEY. Never log secrets.
if (typeof window !== "undefined") throw new Error("keyVault is server-only.");

type Vault = Map<string, Map<string, string>>;
const store: Vault = new Map();
const norm = (v: string): string => v.trim().toLowerCase();

export function keyEnvFor(provider: string): string {
  const p = provider.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `UPSTREAM_${p}_KEY`;
}

export function saveKey(userId: string, provider: string, keyRef: string): void {
  const u = userId.trim(); if (!u) throw new Error("saveKey: userId required.");
  const p = norm(provider); if (!p) throw new Error("saveKey: provider required.");
  const r = keyRef.trim(); if (!r) throw new Error("saveKey: keyRef required.");
  let m = store.get(u); if (!m) { m = new Map(); store.set(u, m); }
  m.set(p, r);
}

export function getKeyRef(userId: string, provider: string): string | null {
  return store.get(userId.trim())?.get(norm(provider)) ?? null;
}

export function hasKey(userId: string, provider: string): boolean {
  return getKeyRef(userId, provider) !== null;
}

export function listProviders(userId: string): string[] {
  return [...(store.get(userId.trim())?.keys() ?? [])];
}

// --- AES-GCM helpers (WebCrypto stub, no deps) ---
export async function encryptAESGCM(plain: string, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(Buffer.from(keyB64, "base64"));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, 12);
  return Buffer.from(out).toString("base64");
}

export async function decryptAESGCM(payloadB64: string, keyB64: string): Promise<string> {
  const raw = Uint8Array.from(Buffer.from(payloadB64, "base64"));
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(Buffer.from(keyB64, "base64")), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(pt);
}

// --- log redaction ---
export function redact(value: unknown, keep = 0): string {
  if (value == null || value === "") return "[REDACTED]";
  const s = String(value); if (s.length <= keep || keep <= 0) return "[REDACTED]";
  return `[REDACTED:${s.slice(-keep)}]`;
}

export function redactObj<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (/key|secret|token|auth/i.test(k)) out[k as keyof T] = "[REDACTED]" as never;
  }
  return out;
}
