// LexForge: localStorage (lexforge:v1) -> server migration. Envelope: {version,savedAt,payload}.
export interface Snapshot { version: number; savedAt: string; payload: Record<string, any> }
const KEY = "lexforge:v1", BACKUP = "lexforge:v1:backup";

export function exportSnapshot(): Snapshot {
  const raw = localStorage.getItem(KEY);
  if (!raw) throw new Error("No local snapshot");
  const s = JSON.parse(raw) as Snapshot;
  if (typeof s.version !== "number" || !s.savedAt || typeof s.payload !== "object" || !s.payload)
    throw new Error("Bad envelope");
  return s;
}

export async function migrateLocalToServer(): Promise<{ applied: number; conflicts: any[] }> {
  const snap = exportSnapshot();
  const res = await fetch("/api/migrate", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap) });
  if (!res.ok) throw new Error(`Migrate failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error("Server rejected migration");
  // server-wins: local conflicts discarded; backup, then wipe only after verify
  localStorage.setItem(BACKUP, JSON.stringify(snap));
  localStorage.removeItem(KEY);
  return { applied: data.applied ?? 0, conflicts: data.conflicts ?? [] };
}

export function rollback(): Snapshot | null {
  const raw = localStorage.getItem(BACKUP);
  if (!raw) return null;
  localStorage.setItem(KEY, raw);
  return JSON.parse(raw) as Snapshot;
}
