// hooks/useOrchestratedTrial.ts — dual-pane (judge+counsel) orchestrated trial stream.
import { useEffect, useState } from "react";

export type Pane = "judge" | "counsel";
export type PaneText = Record<string, string>; // message_id -> accumulated text
type Frame = { message_id: string; delta?: string; text?: string };

export function useOrchestratedTrial(judgeRunId: string | null, counselRunId: string | null) {
  const [panes, setPanes] = useState<Record<Pane, PaneText>>({ judge: {}, counsel: {} });
  const [transcript, setTranscript] = useState<(Frame & { pane: Pane })[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let alive = true;
    let finished = 0;
    const sources: EventSource[] = [];
    setPanes({ judge: {}, counsel: {} });
    setTranscript([]);
    setSettled(false);

    const append = (pane: Pane, f: Frame) => {
      const chunk = f.delta ?? f.text ?? "";
      if (!f.message_id || !chunk) return;
      setPanes((p) => ({ ...p, [pane]: { ...p[pane], [f.message_id]: (p[pane][f.message_id] ?? "") + chunk } }));
      setTranscript((t) => {
        const last = t[t.length - 1];
        if (last && last.pane === pane && last.message_id === f.message_id)
          return [...t.slice(0, -1), { ...last, text: (last.text ?? "") + chunk }];
        return [...t, { pane, message_id: f.message_id, text: chunk }];
      });
    };

    const finish = () => {
      if (++finished === 2 && alive) setSettled(true);
    };

    const fallback = async (pane: Pane, runId: string) => {
      // Vercel buffered fallback: route returns a single JSON body { messages: Frame[] }.
      try {
        const r = await fetch(`/api/stream?run_id=${encodeURIComponent(runId)}&buffered=1`);
        const b = await r.json();
        if (alive) (b.messages ?? [b]).forEach((f: Frame) => append(pane, f));
      } finally {
        if (alive) finish();
      }
    };

    ([["judge", judgeRunId], ["counsel", counselRunId]] as [Pane, string | null][]).forEach(
      ([pane, runId]) => {
        if (!runId) return finish();
        const es = new EventSource(`/api/stream?run_id=${encodeURIComponent(runId)}`);
        sources.push(es);
        es.onmessage = (e) => {
          try {
            append(pane, JSON.parse(e.data));
          } catch { /* keepalive comment or partial frame */ }
        };
        es.addEventListener("run.completed", () => {
          es.close();
          finish();
        });
        es.onerror = () => {
          es.close();
          void fallback(pane, runId);
        };
      }
    );

    return () => {
      alive = false;
      sources.forEach((s) => s.close());
    };
  }, [judgeRunId, counselRunId]);

  return { panes, transcript, settled };
}
