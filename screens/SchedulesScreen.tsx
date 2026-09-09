import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../components/Button";

type Kind = "drill" | "due" | "checkin" | "cohort";

interface ScheduleItem {
  id: string;
  kind: string;
  schedule_display?: string;
  schedule?: { expr: string };
  state?: string;
  enabled?: boolean;
  created_at?: string;
}

const KINDS: Kind[] = ["drill", "due", "checkin", "cohort"];

const badgeFor = (s: ScheduleItem): string => {
  if (s.enabled === false) return "border-brand-border text-brand-text-secondary";
  return "border-brand-border-light text-brand-text-primary";
};

const parsePayload = (raw: string): unknown => {
  const t = raw.trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return t; }
};

const SchedulesScreen: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<Kind>("drill");
  const [expr, setExpr] = useState("0 9 * * *");
  const [payloadText, setPayloadText] = useState("");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = userId.trim();
    if (!id) { setError("Enter a user id to load schedules."); return; }
    setLoading(true); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/cron/schedules?user_id=${encodeURIComponent(id)}`);
      const j = await r.json() as { schedules?: ScheduleItem[]; error?: string };
      if (!r.ok) throw new Error(j.error || "Load failed");
      setItems(j.schedules || []);
      setNotice(`Loaded ${j.schedules?.length ?? 0} schedules.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId.trim()) void load(); }, [load, userId]);

  const create = async () => {
    const id = userId.trim();
    if (!id) { setError("Enter a user id first."); return; }
    if (expr.trim().split(/\s+/).length !== 5) { setError("Cron must have 5 fields."); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/cron/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id, kind, schedule: { kind: "cron", expr: expr.trim() }, payload: parsePayload(payloadText) }),
      });
      const j = await r.json() as { schedule?: ScheduleItem; error?: string };
      if (!r.ok) throw new Error(j.error || "Create failed");
      if (j.schedule) setItems((p) => [j.schedule as ScheduleItem, ...p]);
      setNotice("Schedule created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Create failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-brand-bg-primary">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Schedules</p>
          <h1 className="mt-1 text-xl text-brand-text-primary">Per user schedule manager</h1>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-bg-secondary p-4 space-y-3">
          <label className="block text-[12px] text-brand-text-secondary">User id
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_123" className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2 text-[13px] text-brand-text-primary" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-[12px] text-brand-text-secondary">Kind
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2 text-[13px] text-brand-text-primary">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="block text-[12px] text-brand-text-secondary">Cron expression
              <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="0 9 * * *" className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2 font-mono text-[13px] text-brand-text-primary" />
            </label>
          </div>
          <p className="text-[12px] text-brand-text-secondary">Example: 0 9 * * * runs daily at 9:00. Use 5 fields: minute hour day month weekday.</p>
          <label className="block text-[12px] text-brand-text-secondary">Payload (optional JSON or text)
            <input value={payloadText} onChange={(e) => setPayloadText(e.target.value)} placeholder='{"focus": "objections"}' className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2 font-mono text-[13px] text-brand-text-primary" />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" onClick={load} isLoading={loading}>Load</Button>
            <Button variant="secondary" onClick={create} isLoading={saving}>Create schedule</Button>
          </div>
          {error && <p className="text-[13px] text-brand-error">{error}</p>}
          {notice && <p className="text-[13px] text-brand-text-secondary">{notice}</p>}
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-bg-secondary p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Existing ({items.length})</p>
          {items.length === 0 ? <p className="mt-2 text-[13px] text-brand-text-secondary">No schedules yet for this user.</p> : (
            <ul className="mt-2 space-y-2">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-brand-text-primary truncate">{s.kind} <span className="font-mono text-brand-text-secondary">{s.schedule_display || s.schedule?.expr}</span></p>
                    {s.created_at && <p className="text-[11px] text-brand-text-secondary">{s.created_at}</p>}
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide ${badgeFor(s)}`}>{s.enabled === false ? "disabled" : s.state || "scheduled"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchedulesScreen;
