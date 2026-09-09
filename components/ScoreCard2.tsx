import { Scale, Cpu, Bot, User, AlertTriangle, ArrowRight } from "lucide-react";

export type DimKey = "argument" | "precedent" | "grounding" | "response" | "objections" | "presence";
export type Vote = "A" | "B" | "ABSTAIN";
export type Voters = { heuristic: Vote; llm: Vote; human: Vote | null };

type Props = {
  dimensions: Record<DimKey, number>;
  voters: Voters;
  verdict: Vote;
  confidence: number;
  onRequestReview?: () => void;
};

const DIMS: { key: DimKey; label: string }[] = [
  { key: "argument", label: "Argument" },
  { key: "precedent", label: "Precedent" },
  { key: "grounding", label: "Grounding" },
  { key: "response", label: "Response" },
  { key: "objections", label: "Objections" },
  { key: "presence", label: "Presence" },
];

const bar = (s: number) => (s >= 80 ? "bg-emerald-400" : s >= 60 ? "bg-amber-400" : "bg-rose-400");
const pill = (v: Vote | null) => (v === "A" ? "border-emerald-500/40 text-emerald-300" : v === "B" ? "border-sky-500/40 text-sky-300" : "border-zinc-600/60 text-zinc-400");

export default function ScoreCard2({ dimensions, voters, verdict, confidence, onRequestReview }: Props) {
  const abstain = verdict === "ABSTAIN";
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  const rows = [
    { icon: Cpu, label: "Heuristic", vote: voters.heuristic as Vote | null },
    { icon: Bot, label: "LLM", vote: voters.llm as Vote | null },
    { icon: User, label: "Human", vote: voters.human },
  ];
  return (
    <section aria-label="Rubric score card" className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100"><Scale className="h-4 w-4 text-emerald-300" /> Rubric Score</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${abstain ? "border-amber-400/50 text-amber-300" : "border-emerald-500/40 text-emerald-300"}`}>{abstain ? "ABSTAIN" : `Winner ${verdict}`}</span>
          <span className="font-mono text-zinc-400">{pct}% conf</span>
        </div>
      </header>
      <ul className="space-y-2">
        {DIMS.map((d) => (
          <li key={d.key} className="text-xs">
            <div className="mb-1 flex justify-between"><span className="capitalize text-zinc-300">{d.label}</span><span className="font-mono text-zinc-400">{dimensions[d.key]}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/40"><div className={`h-full rounded-full ${bar(dimensions[d.key])}`} style={{ width: `${dimensions[d.key]}%` }} /></div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center justify-between rounded-lg border bg-black/30 px-2 py-1.5 text-xs ${pill(r.vote)}`}>
            <span className="flex items-center gap-1"><r.icon className="h-3.5 w-3.5" />{r.label}</span>
            <span className="font-mono font-semibold">{r.vote ?? "—"}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${pct}%` }} /></div>
      {abstain && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs text-amber-200"><AlertTriangle className="h-4 w-4" /> Tied / low confidence — needs human review.</p>
          <button onClick={onRequestReview} className="flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-300">Review <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </section>
  );
}
