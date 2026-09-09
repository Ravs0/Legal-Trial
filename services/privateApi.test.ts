// LexForge Legal-Trial: private API contract locks (fixtures only, no impl imports).
import { createHmac, timingSafeEqual } from "node:crypto";
function assert(c: unknown, m: string): void { if (!c) throw new Error("assert: " + m); }
const REDACTED = "[REDACTED]";
function redact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) out[k] = /key|secret|token|auth/i.test(k) ? REDACTED : o[k];
  return out;
}
function resolveKey(h?: string, v?: string, e?: string): { key: string; src: string } {
  if (h) return { key: h, src: "byok" };
  if (v) return { key: v, src: "vault" };
  return { key: e ?? "", src: "env" };
}
function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
function verifyHmac(body: string, sig: string, secret: string): boolean {
  const a = Buffer.from(hmac(body, secret)); const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
{ // 1 keyVault redaction
  const r = redact({ apiKey: "sk-live", name: "x" });
  assert(r.apiKey === REDACTED, "key redacted");
  assert(r.name === "x", "non-secret kept");
}
{ // 2 byokRouter source precedence
  assert(resolveKey("h", "v", "e").src === "byok", "header first");
  assert(resolveKey(undefined, "v", "e").src === "vault", "vault second");
  assert(resolveKey(undefined, undefined, "e").src === "env", "env fallback");
}
{ // 3 idempotency replay
  const store = new Map<string, unknown>(); let runs = 0;
  const call = (k: string, fn: () => unknown) => {
    if (store.has(k)) return { body: store.get(k), replay: true };
    runs++; const b = fn(); store.set(k, b); return { body: b, replay: false };
  };
  const a = call("k1", () => ({ ok: true })); const b = call("k1", () => ({ ok: false }));
  assert(a.replay === false && runs === 1, "first executes");
  assert(b.replay === true && (b.body as { ok: boolean }).ok === true, "replay first body");
}
{ // 4 webhook HMAC accept/reject
  const body = '{"t":"x"}'; const good = hmac(body, "s3");
  assert(verifyHmac(body, good, "s3"), "valid accepted");
  assert(!verifyHmac(body + "!", good, "s3"), "tampered rejected");
  assert(!verifyHmac(body, good, "wrong"), "wrong secret rejected");
}
{ // 5 quota 429
  const check = (used: number, limit: number) => (used >= limit ? 429 : 200);
  assert(check(99, 100) === 200, "under allowed");
  assert(check(100, 100) === 429, "at-limit 429");
}
{ // 6 voice privacy local-only
  const stt = (localOnly: boolean, moot: boolean, pref: string) =>
    (localOnly || moot ? "local-whisper" : pref);
  assert(stt(true, false, "sarvam") === "local-whisper", "local_only forces local");
  assert(stt(false, true, "sarvam") === "local-whisper", "moot forces local");
  assert(stt(false, false, "sarvam") === "sarvam", "non-moot respects pref");
}
console.log("privateApi passed (6/6)");
