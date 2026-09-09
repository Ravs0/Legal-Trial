import React, { useState } from "react";

type Ep = { label: string; method: string; path: string; body: string; idem: boolean };

const EPS: Ep[] = [
  { label: "GET scores", method: "GET", path: "/api/lexforge/scores", body: "", idem: false },
  { label: "POST scores", method: "POST", path: "/api/lexforge/scores", body: '{"session_id":"s1","drill_id":"irsc-101","points":8}', idem: false },
  { label: "GET drills", method: "GET", path: "/api/lexforge/drills", body: "", idem: false },
  { label: "POST runs", method: "POST", path: "/api/lexforge/runs", body: '{"drill_id":"irsc-101"}', idem: true },
  { label: "POST chat", method: "POST", path: "/v1/chat/completions", body: '{"model":"lexforge-trial","messages":[{"role":"user","content":"State the Art 21 bail test"}]}', idem: false },
];

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function ApiConsoleScreen(): React.ReactElement {
  const [apiKey, setApiKey] = useState("");
  const [epIdx, setEpIdx] = useState(0);
  const [body, setBody] = useState("");
  const [idemKey, setIdemKey] = useState("");
  const [out, setOut] = useState("Responses appear here.");
  const [busy, setBusy] = useState(false);
  const ep = EPS[epIdx];

  function pick(i: number): void {
    setEpIdx(i);
    setBody(EPS[i].body);
    if (EPS[i].idem && !idemKey) setIdemKey(newKey());
  }

  async function send(): Promise<void> {
    setBusy(true);
    setOut("Sending...");
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (ep.idem && idemKey) headers["Idempotency-Key"] = idemKey;
      const res = await fetch(ep.path, {
        method: ep.method,
        headers,
        body: ep.method === "GET" ? undefined : body || undefined,
      });
      const raw = await res.text();
      const ms = Math.round(performance.now() - t0);
      setOut(`${ep.method} ${ep.path}\nStatus ${res.status} in ${ms} ms\n\n${pretty(raw)}`);
    } catch (e) {
      setOut(`Request failed: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-brand-bg-primary">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand-text-secondary">Labs</p>
          <h1 className="font-serif text-2xl text-brand-text-primary">API console</h1>
          <p className="text-sm text-brand-text-secondary">Campus playground. Key stays in memory and is never logged.</p>
        </div>
        <label className="block text-sm text-brand-text-primary">
          Bearer key
          <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste campus key" className="mt-1 h-10 w-full rounded border border-brand-border bg-brand-bg-secondary px-3 text-sm text-brand-text-primary" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-brand-text-primary">
            Endpoint
            <select value={epIdx} onChange={(e) => pick(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded border border-brand-border bg-brand-bg-secondary px-2 text-sm text-brand-text-primary">
              {EPS.map((o, i) => <option key={o.label} value={i}>{o.label} {o.method} {o.path}</option>)}
            </select>
          </label>
          <label className="block text-sm text-brand-text-primary">
            Idempotency key
            <span className="ml-2 text-xs text-brand-text-secondary">{ep.idem ? "auto filled for runs" : "used by runs"}</span>
            <span className="mt-1 flex gap-2">
              <input value={idemKey} onChange={(e) => setIdemKey(e.target.value)} placeholder={ep.idem ? "auto filled" : "optional"}
                className="h-10 w-full rounded border border-brand-border bg-brand-bg-secondary px-3 font-mono text-xs text-brand-text-primary" />
              {ep.idem && <button type="button" onClick={() => setIdemKey(newKey())}
                className="h-10 shrink-0 rounded border border-brand-border px-3 text-xs text-brand-text-primary">New</button>}
            </span>
          </label>
        </div>
        <label className="block text-sm text-brand-text-primary">
          JSON body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} spellCheck={false}
            placeholder={ep.method === "GET" ? "GET sends no body" : '{"key":"value"}'}
            className="mt-1 w-full rounded border border-brand-border bg-brand-bg-secondary p-3 font-mono text-xs text-brand-text-primary" />
        </label>
        <button type="button" onClick={send} disabled={busy}
          className="h-10 rounded bg-brand-text-primary px-6 text-sm text-brand-bg-primary disabled:opacity-50">
          {busy ? "Sending..." : "Send"}
        </button>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-brand-border bg-brand-bg-secondary p-3 font-mono text-xs text-brand-text-primary">{out}</pre>
      </div>
    </div>
  );
}
