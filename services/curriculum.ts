export type Level = 1 | 2 | 3;
export type Grade = "fail" | "ok" | "pass";
export interface Drill { id: string; skill: string; level: Level; prompt: string; model_answer: string; rubric: string[]; timed?: boolean }
export interface Attempt { drillId: string; skill: string; score: number; at: number } // score 0-100
export interface Card { drillId: string; intervalDays: number; dueAt: number }
export const DAY = 86_400_000;
export const DRILLS: Drill[] = [
  { id: "irac-1", skill: "IRAC", level: 1, prompt: "Spot issues in a slip-and-fall paragraph.", model_answer: "Duty, breach, causation, damages; invitee standard.", rubric: ["lists all IRAC issues", "states correct standard"] },
  { id: "irac-2", skill: "IRAC", level: 2, prompt: "Apply invitee duty to wet-floor facts in 5 lines.", model_answer: "Knowledge + reasonable care; cite Restatement 343.", rubric: ["rule stated", "facts applied", "conclusion"] },
  { id: "irac-3", skill: "IRAC", level: 3, prompt: "Timed (10m): full IRAC memo on guest-injury hypo.", model_answer: "Full memo with counterargument and damages caveat.", rubric: ["complete IRAC", "counterargument", "on time"], timed: true },
  { id: "obj-1", skill: "Objection", level: 1, prompt: "Name the objection: 'He told me she signed.'", model_answer: "Hearsay.", rubric: ["correct objection"] },
  { id: "obj-2", skill: "Objection", level: 2, prompt: "Draft a 2-line hearsay objection + exception reply.", model_answer: "Objection hearsay; opponent: excited utterance.", rubric: ["proper form", "exception handled"] },
  { id: "obj-3", skill: "Objection", level: 3, prompt: "Timed (8m): rule on 5 rapid-fire objections with grounds.", model_answer: "Sustain/overrule each with one-line ground.", rubric: ["4/5 correct", "grounds cited", "on time"], timed: true },
];
export function avgLast3(a: Attempt[]): number {
  if (!a.length) return 0;
  const last = [...a].sort((x, y) => x.at - y.at).slice(-3);
  return last.reduce((s, x) => s + x.score, 0) / last.length;
}
export function unlockedLevel(skill: string, as: Attempt[]): Level {
  const l1 = as.filter(a => a.skill === skill && byId(a.drillId)?.level === 1);
  if (avgLast3(l1) < 80) return 1;
  const l2 = as.filter(a => a.skill === skill && byId(a.drillId)?.level === 2);
  if (l2.length < 3 || avgLast3(l2) < 80) return 2;
  return 3;
}
export function isUnlocked(d: Drill, as: Attempt[]): boolean { return d.level <= unlockedLevel(d.skill, as); }
export function byId(id: string): Drill | undefined { return DRILLS.find(d => d.id === id); }
export function nextInterval(g: Grade, prev: number): number {
  if (g === "fail") return 1;
  if (g === "ok") return 3;
  return Math.min(30, Math.max(2, prev * 2)); // pass: double, cap 30d
}
export function nextDue(g: Grade, c: Card, now = Date.now()): Card {
  const intervalDays = nextInterval(g, c.intervalDays);
  return { ...c, intervalDays, dueAt: now + intervalDays * DAY };
}
export function avgByDrill(as: Attempt[]): Map<string, number> {
  const m = new Map<string, number[]>();
  for (const a of as) { const l = m.get(a.drillId) ?? []; l.push(a.score); m.set(a.drillId, l); }
  return new Map([...m].map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]));
}
export function pickEvening(cards: Card[], as: Attempt[], now = Date.now()): Drill[] {
  const due = cards.filter(c => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3);
  const picked = new Set(due.map(c => c.drillId));
  const avg = avgByDrill(as);
  const weakest = DRILLS.filter(d => !picked.has(d.id) && isUnlocked(d, as))
    .sort((a, b) => (avg.get(a.id) ?? 0) - (avg.get(b.id) ?? 0)).slice(0, 2);
  return [...due.map(c => byId(c.drillId)!).filter(Boolean), ...weakest];
}
