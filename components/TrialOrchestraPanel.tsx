import { useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { LoadingSpinner } from "./LoadingSpinner";
import { useOrchestratedTrial } from "../hooks/useOrchestratedTrial";

interface Props { caseId: string; phase: string; }
interface ScoreState { score: number; dimensions?: Record<string, number>; decision?: string; }
interface EndState { caseId: string; phase: string; ok: boolean; }

const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const t = o.text ?? o.delta ?? o.message ?? o.content;
    if (typeof t === "string") return t;
    return JSON.stringify(v);
  }
  return "";
};

export function TrialOrchestraPanel({ caseId, phase }: Props) {
  const [argument, setArgument] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [judgeText, setJudgeText] = useState("");
  const [counselText, setCounselText] = useState("");
  const [score, setScore] = useState<ScoreState | null>(null);
  const [summary, setSummary] = useState<EndState | null>(null);
  const { panes, settled } = useOrchestratedTrial(null, null);

  const liveJudge = Object.values(panes.judge).join("") || judgeText;
  const liveCounsel = Object.values(panes.counsel).join("") || counselText;

  const runTurn = async () => {
    if (!argument.trim() || busy) return;
    setBusy(true);
    setError(null);
    setScore(null);
    setSummary(null);
    setJudgeText("");
    setCounselText("");
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, phase, argument }),
      });
      if (!res.ok || !res.body) {
        let msg = `Request failed with status ${res.status}.`;
        try { const b = await res.json(); if (b?.error) msg = String(b.error); } catch { /* keep status msg */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const onFrame = (event: string, data: string) => {
        let payload: unknown = null;
        try { payload = JSON.parse(data); } catch { payload = data; }
        if (event === "judge.delta") setJudgeText((p) => p + textOf(payload));
        else if (event === "counsel.delta") setCounselText((p) => p + textOf(payload));
        else if (event === "score.update") setScore(payload as ScoreState);
        else if (event === "turn.end") setSummary(payload as EndState);
        else if (event === "turn.error") {
          const o = payload as { source?: string; message?: string };
          setError(`Turn error from ${o?.source ?? "orchestrator"}: ${o?.message ?? "unknown error"}`);
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /event:\s*(.+)/.exec(raw)?.[1]?.trim() ?? "";
          const dm = /data:\s*([\s\S]+)/.exec(raw)?.[1]?.trim() ?? "";
          if (ev && dm) onFrame(ev, dm);
        }
        if (done) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Orchestration failed. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`Trial Orchestra: ${phase}`} className="bg-brand-bg-secondary border-brand-border">
      <label htmlFor="orchestra-arg" className="text-[12px] text-brand-text-secondary">Argument for case {caseId}</label>
      <textarea
        id="orchestra-arg"
        value={argument}
        onChange={(e) => setArgument(e.target.value)}
        rows={4}
        placeholder="Enter your argument for this phase"
        className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg-primary p-2 text-[13px] text-brand-text-primary"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={runTurn} isLoading={busy} disabled={busy || !argument.trim()}>Run turn</Button>
        {busy && <LoadingSpinner size="sm" text="Running turn" />}
        {settled && !busy && <span className="text-[11px] text-brand-text-secondary">Streams settled</span>}
      </div>
      {error && <p role="alert" className="mt-2 rounded-md border border-brand-error/40 p-2 text-[12px] text-brand-error">{error}</p>}
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-md border border-brand-border p-2">
          <h4 className="text-[12px] font-medium text-brand-text-primary">Judge stream</h4>
          <p className="mt-1 min-h-16 whitespace-pre-wrap text-[12px] text-brand-text-secondary">{liveJudge || "No judge output yet."}</p>
        </div>
        <div className="rounded-md border border-brand-border p-2">
          <h4 className="text-[12px] font-medium text-brand-text-primary">Counsel stream</h4>
          <p className="mt-1 min-h-16 whitespace-pre-wrap text-[12px] text-brand-text-secondary">{liveCounsel || "No counsel output yet."}</p>
        </div>
      </div>
      {score && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Score updates">
          <span className="rounded-md border border-brand-border px-2 py-0.5 text-[11px] text-brand-text-primary">Score {score.score}</span>
          {Object.entries(score.dimensions ?? {}).map(([k, v]) => (
            <span key={k} className="rounded-md border border-brand-border px-2 py-0.5 text-[11px] text-brand-text-secondary">{k}: {v}</span>
          ))}
          {score.decision && <span className="rounded-md border border-brand-border px-2 py-0.5 text-[11px] text-brand-text-secondary">{score.decision}</span>}
        </div>
      )}
      {summary && <p className="mt-2 text-[12px] text-brand-text-primary">Turn complete for {summary.caseId} in {summary.phase}.</p>}
    </Card>
  );
}
