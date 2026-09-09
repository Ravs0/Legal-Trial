// LexForge services/compaction.ts — rolling micro-summaries + phase-edge snapshots.
export type Phase = "opening" | "rebuttal" | "closing";
export interface Msg {
  id: string; role: "user" | "assistant" | "system";
  content: string; phase: Phase; cites?: string[];
  active: boolean; compacted: boolean; // window flags
}
export interface Snap { phase: Phase; mode: "verbatim" | "bullets" | "tail"; text: string; }

export const AUX_TEMP = 0.1; // aux-LLM temperature (deterministic stubs)
export const MAX_CHARS = 60_000, MAX_MSGS = 30;
export const WEIGHTS = { current: 0.5, cites: 0.25, summary: 0.15, stubs: 0.1 };

let summary = "";           // rolling micro-summary
const snaps: Snap[] = [];   // phase-edge snapshots
const stubs: string[] = []; // one-line refs to compacted turns
const stubbed = new Set<string>();

/** Aux-LLM stub — swap for a real call; temperature pinned at 0.1. */
export async function auxSummarize(prompt: string, temp = AUX_TEMP): Promise<string> {
  void temp;
  const s = prompt.replace(/\s+/g, " ").trim();
  return s.length > 280 ? s.slice(0, 277) + "..." : s || "(empty)";
}

/** Fold one turn into the rolling micro-summary (call per turn). */
export async function summarizeTurn(m: Msg): Promise<string> {
  const micro = await auxSummarize(`[${m.phase}/${m.role}] ${m.content}`);
  summary = (summary ? summary + " | " : "") + micro;
  summary = summary.slice(-Math.floor(MAX_CHARS * WEIGHTS.summary));
  return micro;
}

/** Phase-edge snapshot: opening verbatim, rebuttal→bullets, closing protected tail. */
export function snapshotEdge(prev: Phase, turns: Msg[]): Snap | null {
  const body = turns.filter((t) => t.phase === prev);
  if (!body.length) return null;
  const text =
    prev === "opening" ? body.map((t) => t.content).join("\n")
    : prev === "rebuttal" ? body.map((t) => `• ${t.content.split(/(?<=[.!?])\s+/)[0]}`).join("\n")
    : body.slice(-3).map((t) => t.content).join("\n"); // closing tail: verbatim, never summarized
  const s: Snap = { phase: prev, mode: prev === "opening" ? "verbatim" : prev === "rebuttal" ? "bullets" : "tail", text };
  snaps.push(s);
  return s;
}

/** Roll the window: flag active/compacted, stub evicted turns, assemble budgeted context. */
export function compact(log: Msg[]): string {
  const win = log.slice(-MAX_MSGS);
  const tail = log.filter((m) => m.phase === "closing").slice(-3); // protected: exempt from eviction
  const kept = win.concat(tail.filter((m) => win.indexOf(m) < 0));
  for (const m of log) {
    m.active = kept.indexOf(m) >= 0;
    m.compacted = !m.active;
    if (m.compacted && !stubbed.has(m.id)) { stubbed.add(m.id); stubs.push(`[${m.phase}/${m.role}] ${m.content.slice(0, 80)}`); }
  }
  const cut = (s: string, w: number) => s.slice(-Math.floor(MAX_CHARS * w));
  const cites = kept.map((m) => (m.cites || []).join("; ")).filter((c) => c).join("; ");
  return [
    `[current 50%]\n${cut(kept.map((m) => `${m.role}: ${m.content}`).join("\n"), WEIGHTS.current)}`,
    `[cites 25%]\n${cut(cites, WEIGHTS.cites)}`,
    `[summary 15%]\n${summary}`,
    `[stubs 10%]\n${cut(stubs.join(" | "), WEIGHTS.stubs)}`,
    `[edges]\n${snaps.map((s) => `<${s.phase}/${s.mode}> ${s.text}`).join("\n")}`,
  ].join("\n");
}

export function reset() { summary = ""; snaps.length = 0; stubs.length = 0; stubbed.clear(); }
