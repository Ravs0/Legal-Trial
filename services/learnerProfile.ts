// LexForge learnerProfile: §-delimited ledger (localStorage now, ProfileStore is DB-ready).
// DB: CREATE TABLE learner_profiles (user_id TEXT PRIMARY KEY, strengths TEXT, weaknesses TEXT, vocab TEXT, judge_history TEXT, updated_at TIMESTAMPTZ);
export type PromptRole = "judge" | "counsel";
export interface LearnerProfile { strengths: string; weaknesses: string; vocab: string; judgeHistory: string; updatedAt: string; }
export interface SessionResult { strengths?: string[]; weaknesses?: string[]; vocab?: string[]; verdict?: string; score?: number; }
export interface ProfileStore { load(): LearnerProfile | null; save(p: LearnerProfile): void; }
export const MAX_STORE_CHARS = 2200; // Hermes-style full ledger cap (650+650+450+450)
export const MAX_PROMPT_CHARS = 1375; // Hermes-style system-prompt injection cap
const KEY = "lexforge:learnerProfile";
const SEP = "§";
const CAPS = { strengths: 650, weaknesses: 650, vocab: 450, judgeHistory: 450 } as const;
export const emptyProfile = (): LearnerProfile => ({ strengths: "", weaknesses: "", vocab: "", judgeHistory: "", updatedAt: new Date().toISOString() });
const split = (s: string): string[] => (s ? s.split(SEP).map((t) => t.trim()).filter(Boolean) : []);
const join = (a: string[]): string => a.join(` ${SEP} `);
// Append deduped items, drop oldest entries while over the per-field char cap.
function push(prev: string, items: string[], cap: number): string {
  const list = split(prev);
  const seen = new Set(list);
  for (const raw of items) { const t = raw.trim(); if (t && !seen.has(t)) { seen.add(t); list.push(t); } }
  let s = join(list);
  while (s.length > cap && list.length > 1) { list.shift(); s = join(list); }
  return s;
}
// Merge one session into the ledger; per-field caps sum to MAX_STORE_CHARS.
export function update(p: LearnerProfile, r: SessionResult): LearnerProfile {
  const verdict = r.verdict ? [r.score == null ? r.verdict : `${r.verdict} (${r.score})`] : [];
  return { strengths: push(p.strengths, r.strengths ?? [], CAPS.strengths), weaknesses: push(p.weaknesses, r.weaknesses ?? [], CAPS.weaknesses), vocab: push(p.vocab, r.vocab ?? [], CAPS.vocab), judgeHistory: push(p.judgeHistory, verdict, CAPS.judgeHistory), updatedAt: new Date().toISOString() };
}
// Injector: append its return to the judge/counsel system prompt. Truncated to 1375 chars.
export function renderForPrompt(p: LearnerProfile, role: PromptRole): string {
  const body = role === "judge" ? `Weaknesses: ${p.weaknesses || "—"}\nPrior rulings: ${p.judgeHistory || "—"}\nVocab to watch: ${p.vocab || "—"}` : `Strengths: ${p.strengths || "—"}\nWeaknesses to drill: ${p.weaknesses || "—"}\nVocab: ${p.vocab || "—"}`;
  const out = `[Learner ledger]\n${body}`;
  return out.length > MAX_PROMPT_CHARS ? `${out.slice(0, MAX_PROMPT_CHARS - 1)}…` : out;
}
let mem: LearnerProfile | null = null; // SSR / non-browser fallback
const hasLS = (): boolean => typeof localStorage !== "undefined";
// Default localStorage-backed store; swap with a Postgres impl of ProfileStore later.
export const store: ProfileStore = {
  load(): LearnerProfile | null {
    try { if (!hasLS()) return mem; const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as LearnerProfile) : null; } catch { return mem; }
  },
  save(p: LearnerProfile): void {
    try { if (!hasLS()) { mem = p; return; } localStorage.setItem(KEY, JSON.stringify(p)); } catch { mem = p; }
  },
};
export const loadProfile = (s: ProfileStore = store): LearnerProfile => s.load() ?? emptyProfile();
export const saveProfile = (p: LearnerProfile, s: ProfileStore = store): void => s.save(p);
