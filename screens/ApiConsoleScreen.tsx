import React, { useState } from "react";
import { sessionFetch } from "../services/sessionService";

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

type JevType = "Choice" | "Score" | "Noul";

type JevRow = {
  id: string;
  name: string;
  type: JevType;
  details: string;
};

function newRowId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `jev-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

type JevAnswer =
  | { kind: "choice"; distribution: Record<string, number>; confidence: number }
  | { kind: "score"; score: number; confidence: number }
  | { kind: "noul"; probability: number }
  | { kind: "unknown" };

type JevResult =
  | { status: "ok"; answers: Record<string, JevAnswer>; ms: number }
  | { status: "degraded"; code: string; reason: string; ms: number }
  | { status: "raw"; text: string; ms: number }
  | { status: "error"; message: string; ms: number };

const JEV_STATE_MAX = 8000;

function initialJevRows(): JevRow[] {
  return [
    { id: newRowId(), name: "route_turn", type: "Choice", details: "auto, probe, human_review" },
    { id: newRowId(), name: "clarity", type: "Score", details: "poor, weak, adequate, strong, excellent" },
    { id: newRowId(), name: "cited_authority", type: "Noul", details: "answer cites a statute or case" },
  ];
}

function parseJevAnswer(value: unknown): JevAnswer {
  if (typeof value !== "object" || value === null) return { kind: "unknown" };
  const v = value as Record<string, unknown>;
  // Noul: TypeSafe returns `noul` (the API client also exposes probability).
  const noul = typeof v.noul === "number" ? v.noul : v.probability;
  if (typeof noul === "number" && (v.confidence === undefined || v.confidence === null)) {
    return { kind: "noul", probability: noul };
  }
  // Choice: distribution + confidence
  if (typeof v.confidence === "number") {
    if (typeof v.score === "number") {
      return { kind: "score", score: v.score, confidence: v.confidence };
    }
    const probabilities = v.distribution ?? v.probabilities;
    if (typeof probabilities === "object" && probabilities !== null) {
      const dist: Record<string, number> = {};
      let ok = true;
      for (const [k, p] of Object.entries(probabilities as Record<string, unknown>)) {
        if (typeof p === "number") dist[k] = p;
        else ok = false;
      }
      if (ok) return { kind: "choice", distribution: dist, confidence: v.confidence };
    }
    if (typeof v.probability === "number") {
      return { kind: "noul", probability: v.probability };
    }
  }
  return { kind: "unknown" };
}

function parseJevResponse(raw: string, ms: number): JevResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "raw", text: raw, ms };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { status: "raw", text: raw, ms };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    if (typeof obj.answers === "object" && obj.answers !== null) {
      const answers: Record<string, JevAnswer> = {};
      for (const [k, v] of Object.entries(obj.answers as Record<string, unknown>)) {
        answers[k] = parseJevAnswer(v);
      }
      return { status: "ok", answers, ms };
    }
    return { status: "raw", text: raw, ms };
  }
  if (obj.ok === false) {
    const code = typeof obj.code === "string" ? obj.code : "unknown";
    const reason = typeof obj.reason === "string" ? obj.reason : "no reason supplied";
    return { status: "degraded", code, reason, ms };
  }
  // Dispatcher degraded shape has no `ok` field: { error:"chain-degraded", fn } (api/lexforge.js).
  if (typeof obj.error === "string") {
    const fn = typeof obj.fn === "string" ? obj.fn : "unknown endpoint";
    const reason = typeof obj.reason === "string" ? obj.reason : `${fn} unavailable (server degraded)`;
    return { status: "degraded", code: obj.error, reason, ms };
  }
  return { status: "raw", text: raw, ms };
}

function ConfidenceLine({ confidence }: { confidence: number }): React.ReactElement {
  const pct = Math.round(confidence * 100);
  return (
    <p className="text-xs text-brand-text-secondary">confidence {pct}%</p>
  );
}

function JevAnswerView({ answer }: { answer: JevAnswer }): React.ReactElement {
  if (answer.kind === "choice") {
    const entries = Object.entries(answer.distribution);
    const max = Math.max(0.0001, ...entries.map(([, p]) => p));
    return (
      <div className="space-y-1">
        {entries.map(([opt, p]) => (
          <div key={opt} className="text-xs">
            <div className="flex justify-between text-brand-text-primary">
              <span>{opt}</span>
              <span>{Math.round(p * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-brand-bg-primary">
              <div className="h-full rounded bg-brand-text-primary" style={{ width: `${Math.round((p / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        <ConfidenceLine confidence={answer.confidence} />
      </div>
    );
  }
  if (answer.kind === "score") {
    return (
      <div className="space-y-1">
        <p className="text-sm text-brand-text-primary">normalized score {answer.score.toFixed(2)}</p>
        <ConfidenceLine confidence={answer.confidence} />
      </div>
    );
  }
  if (answer.kind === "noul") {
    const pct = Math.round(Math.min(1, Math.max(0, answer.probability)) * 100);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-brand-text-primary">
          <span>probability</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-brand-bg-primary">
          <div className="h-full rounded bg-brand-text-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-brand-text-secondary">Noul carries no confidence</p>
      </div>
    );
  }
  return <p className="font-mono text-xs text-brand-text-secondary">unrecognized answer shape</p>;
}

export default function ApiConsoleScreen(): React.ReactElement {
  const [apiKey, setApiKey] = useState("");
  const [epIdx, setEpIdx] = useState(0);
  const [body, setBody] = useState("");
  const [idemKey, setIdemKey] = useState("");
  const [out, setOut] = useState("Responses appear here.");
  const [busy, setBusy] = useState(false);
  const ep = EPS[epIdx];

  const [jevRows, setJevRows] = useState<JevRow[]>(initialJevRows);
  const [jevState, setJevState] = useState("");
  const [jevBusy, setJevBusy] = useState(false);
  const [jevResult, setJevResult] = useState<JevResult | null>(null);
  const [jevWarn, setJevWarn] = useState("");

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
      const ownerScoped = ep.path === "/api/lexforge/scores" || ep.path === "/api/lexforge/drills";
      const useSession = !apiKey || ownerScoped;
      const res = useSession
        ? await sessionFetch(ep.path, {
          method: ep.method,
          headers,
          body: ep.method === "GET" ? undefined : body || undefined,
        })
        : await fetch(ep.path, {
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

  function setJevRow(i: number, patch: Partial<JevRow>): void {
    setJevRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addJevRow(): void {
    setJevRows((rows) => [...rows, { id: newRowId(), name: "", type: "Choice", details: "" }]);
  }

  function removeJevRow(i: number): void {
    setJevRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function sendJev(): Promise<void> {
    setJevBusy(true);
    setJevResult(null);
    setJevWarn("");
    const t0 = performance.now();
    try {
      const questions: Record<string, { type: "choice" | "score" | "noul"; instructions: string; criteria?: Record<string, string> | string[] }> = {};
      const seen = new Set<string>();
      const problems: string[] = [];
      for (const row of jevRows) {
        if (!row.name.trim()) continue;
        const qname = row.name.trim();
        if (seen.has(qname)) {
          problems.push(`duplicate question "${qname}" — later row wins`);
        }
        seen.add(qname);
        if (row.type === "Choice") {
          const options = row.details.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 255);
          if (!options.length) {
            problems.push(`"${qname}" Choice needs at least one option — skipped`);
            continue;
          }
          questions[qname] = {
            type: "choice",
            instructions: `Choose the best option for ${qname}.`,
            criteria: Object.fromEntries(options.map((option) => [option, `Choose ${option}.`])),
          };
        } else if (row.type === "Score") {
          const levels = row.details.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
          if (levels.length < 2) {
            problems.push(`"${qname}" Score needs 2-10 ordered levels — skipped`);
            continue;
          }
          questions[qname] = {
            type: "score",
            instructions: `Score ${qname} on the ordered levels.`,
            criteria: levels,
          };
        } else {
          if (!row.details.trim()) {
            problems.push(`"${qname}" Noul needs criteria — skipped`);
            continue;
          }
          questions[qname] = {
            type: "noul",
            instructions: `Decide the yes/no probability for ${qname}.`,
            criteria: { true: row.details.trim(), false: "The condition is not present." },
          };
        }
      }
      if (problems.length) setJevWarn(problems.join(" "));
      if (!Object.keys(questions).length) {
        setJevResult({ status: "error", message: "No valid questions to send.", ms: 0 });
        return;
      }
      if (!jevState.trim()) {
        setJevResult({ status: "error", message: "State is empty — paste a transcript excerpt.", ms: 0 });
        return;
      }
      const payload = {
        state: jevState.slice(0, JEV_STATE_MAX),
        model: "jev-latest",
        questions,
      };
      const res = apiKey
        ? await fetch("/api/lexforge/jev-decide", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        })
        : await sessionFetch("/api/lexforge/jev-decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      const raw = await res.text();
      const ms = Math.round(performance.now() - t0);
      setJevResult(parseJevResponse(raw, ms));
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setJevResult({ status: "error", message: e instanceof Error ? e.message : "network error", ms });
    } finally {
      setJevBusy(false);
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

        <div className="space-y-4 rounded border border-brand-border bg-brand-bg-secondary p-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-brand-text-secondary">TypeSafe System One</p>
            <h2 className="font-serif text-xl text-brand-text-primary">JEV playground</h2>
            <p className="text-sm text-brand-text-secondary">JEV key stays server-side; this panel sends no secrets.</p>
          </div>

          <div className="space-y-3">
            {jevRows.map((row, i) => (
              <div key={row.id} className="space-y-2 rounded border border-brand-border bg-brand-bg-primary p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input value={row.name} onChange={(e) => setJevRow(i, { name: e.target.value })} placeholder="name"
                    className="h-9 w-full rounded border border-brand-border bg-brand-bg-secondary px-2 font-mono text-xs text-brand-text-primary" />
                  <select value={row.type} onChange={(e) => setJevRow(i, { type: e.target.value as JevType })}
                    className="h-9 w-full rounded border border-brand-border bg-brand-bg-secondary px-2 text-xs text-brand-text-primary">
                    <option value="Choice">Choice</option>
                    <option value="Score">Score</option>
                    <option value="Noul">Noul</option>
                  </select>
                  <button type="button" onClick={() => removeJevRow(i)}
                    className="h-9 rounded border border-brand-border px-3 text-xs text-brand-text-primary">Remove</button>
                </div>
                <input value={row.details} onChange={(e) => setJevRow(i, { details: e.target.value })} spellCheck={false}
                  placeholder={row.type === "Choice" ? "comma-separated options (max 255)" : row.type === "Score" ? "comma-separated ordered level labels (2-10)" : "criteria"}
                  className="h-9 w-full rounded border border-brand-border bg-brand-bg-secondary px-2 font-mono text-xs text-brand-text-primary" />
              </div>
            ))}
            <button type="button" onClick={addJevRow}
              className="h-9 rounded border border-brand-border px-3 text-xs text-brand-text-primary">Add question</button>
          </div>

          <label className="block text-sm text-brand-text-primary">
            State
            <textarea value={jevState.slice(0, JEV_STATE_MAX)}
              onChange={(e) => setJevState(e.target.value.slice(0, JEV_STATE_MAX))}
              rows={5} spellCheck={false} placeholder="Paste the state to judge"
              className="mt-1 w-full rounded border border-brand-border bg-brand-bg-primary p-3 font-mono text-xs text-brand-text-primary" />
            <span className="text-xs text-brand-text-secondary">{jevState.length > JEV_STATE_MAX ? JEV_STATE_MAX : jevState.length} / {JEV_STATE_MAX} chars</span>
          </label>

          <button type="button" onClick={sendJev} disabled={jevBusy}
            className="h-10 rounded bg-brand-text-primary px-6 text-sm text-brand-bg-primary disabled:opacity-50">
            {jevBusy ? "Deciding..." : "Ask JEV"}
          </button>

          {jevWarn && (
            <p className="rounded border border-brand-border bg-brand-bg-primary p-2 text-xs text-brand-text-secondary">{jevWarn}</p>
          )}

          {jevResult && jevResult.status === "ok" && (
            <div className="space-y-3">
              <p className="text-xs text-brand-text-secondary">answered in {jevResult.ms} ms</p>
              {Object.entries(jevResult.answers).map(([name, answer]) => (
                <div key={name} className="space-y-1 rounded border border-brand-border bg-brand-bg-primary p-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-brand-text-secondary">{name}</p>
                  <JevAnswerView answer={answer} />
                </div>
              ))}
            </div>
          )}

          {jevResult && jevResult.status === "degraded" && (
            <div className="rounded border border-brand-border bg-brand-bg-primary p-3">
              <p className="font-mono text-xs uppercase tracking-widest text-brand-text-secondary">Degraded</p>
              <p className="font-mono text-sm text-brand-text-primary">{jevResult.code}</p>
              <p className="text-sm text-brand-text-secondary">{jevResult.reason}</p>
              <p className="text-xs text-brand-text-secondary">{jevResult.ms} ms</p>
            </div>
          )}

          {jevResult && jevResult.status === "raw" && (
            <div className="rounded border border-brand-border bg-brand-bg-primary p-3">
              <p className="font-mono text-xs uppercase tracking-widest text-brand-text-secondary">Non-JSON response</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-brand-text-primary">{jevResult.text}</pre>
              <p className="text-xs text-brand-text-secondary">{jevResult.ms} ms</p>
            </div>
          )}

          {jevResult && jevResult.status === "error" && (
            <div className="rounded border border-brand-border bg-brand-bg-primary p-3">
              <p className="font-mono text-xs uppercase tracking-widest text-brand-text-secondary">Request failed</p>
              <p className="text-sm text-brand-text-primary">{jevResult.message}</p>
              <p className="text-xs text-brand-text-secondary">{jevResult.ms} ms</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
