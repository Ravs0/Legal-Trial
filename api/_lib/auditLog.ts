// LexForge Legal-Trial: append-only audit ledger (in-memory).
// TODO: Postgres persistence (append-only table) — currently in-memory + console JSON.

export type AuditMeta = Record<string, unknown>;

export interface AuditEvent {
  actor: string;
  action: string;
  sessionId: string;
  meta?: AuditMeta;
}

export interface AuditEntry extends AuditEvent {
  ts: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const ledger: AuditEntry[] = [];

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL_RE, "[redacted]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

export function log(event: AuditEvent): AuditEntry {
  const entry: AuditEntry = {
    ts: new Date().toISOString(),
    actor: event.actor,
    action: event.action,
    sessionId: event.sessionId,
    ...(event.meta ? { meta: redact(event.meta) as AuditMeta } : {}),
  };
  ledger.push(entry); // append-only: never mutate or remove
  console.log(JSON.stringify(entry)); // TODO: also insert into Postgres
  return entry;
}

export function queryBySession(sessionId: string): readonly AuditEntry[] {
  return ledger.filter((e) => e.sessionId === sessionId);
  // TODO: Postgres: SELECT * FROM audit_log WHERE session_id = $1 ORDER BY ts
}
