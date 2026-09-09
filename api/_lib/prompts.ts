import { createHash } from "node:crypto";

// Postgres DDL:
// CREATE TABLE prompts (hash CHAR(64) PRIMARY KEY, name TEXT NOT NULL,
//   role TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (name, version));
// CREATE TABLE prompt_pins (name TEXT PRIMARY KEY,
//   hash CHAR(64) NOT NULL REFERENCES prompts(hash));

export type Role = "system" | "user" | "assistant" | "tool";
export interface Prompt { hash: string; name: string; role: Role; version: string; body: string; }
export interface InlinePrompt { name: string; role: Role; version: string; body: string; }

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const store = new Map<string, Prompt>(); // hash -> prompt
const byName = new Map<string, Map<string, string>>(); // name -> version -> hash
const pins = new Map<string, string>(); // name -> stable hash

// Register a prompt version; sha256(name, role, version, body) is the PK.
export function register(name: string, role: Role, version: string, body: string): Prompt {
  const hash = sha([name, role, version, body].join("\0"));
  const p: Prompt = { hash, name, role, version, body };
  store.set(hash, p);
  if (!byName.has(name)) byName.set(name, new Map());
  byName.get(name)!.set(version, hash);
  return p;
}

// Fetch by content hash.
export function get(hash: string): Prompt | undefined {
  return store.get(hash);
}

// Pin a version as the stable tag for a name.
export function pin(name: string, version: string): Prompt {
  const hash = byName.get(name)?.get(version);
  if (!hash || !store.has(hash)) throw new Error(`unknown prompt ${name}@${version}`);
  pins.set(name, hash);
  return store.get(hash)!;
}

// Resolve the stable pin for a name.
export function stable(name: string): Prompt | undefined {
  const h = pins.get(name);
  return h ? store.get(h) : undefined;
}

// Deterministic A/B assignment per session; split = fraction routed to A.
export function variant(sessionId: string, name: string, a: string, b: string, split = 0.5): Prompt {
  const n = parseInt(sha(`${sessionId}\0${name}`).slice(0, 8), 16) / 0xffffffff;
  const hash = n < split ? a : b;
  const p = store.get(hash);
  if (!p) throw new Error(`variant not registered: ${hash}`);
  return p;
}

// Backfill registry from inline prompts; returns "name@version" -> hash.
export function backfill(inline: InlinePrompt[] | Record<string, InlinePrompt>): Record<string, string> {
  const list = Array.isArray(inline) ? inline : Object.values(inline);
  const out: Record<string, string> = {};
  for (const p of list) out[`${p.name}@${p.version}`] = register(p.name, p.role, p.version, p.body).hash;
  return out;
}
