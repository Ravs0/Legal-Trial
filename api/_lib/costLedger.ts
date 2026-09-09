// LexForge cost ledger — in-memory + Postgres-ready. Pure TS, zero deps.
export interface UsageRecord {
  sessionId: string; model: string; provider: string; task: string;
  inputTokens: number; outputTokens: number; reasoningTokens: number;
  estimatedCostUsd: number; createdAt: string;
}
export interface RecordUsageInput {
  sessionId: string; model: string; provider?: string; task?: string;
  inputTokens: number; outputTokens: number; reasoningTokens?: number;
  estimatedCostUsd?: number;
}
// DeepSeek pricing (USD per 1M tokens). Retune as prices change.
export const DEEPSEEK_PRICING: Record<string, { in: number; out: number }> = {
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, out: 2.19 },
};
export const DEFAULT_MODEL = "deepseek-chat";
export const DEFAULT_SESSION_BUDGET_USD = 5;
export const WARN_RATIO = 0.8;
const records: UsageRecord[] = [];
const totals = new Map<string, number>();
const budgets = new Map<string, number>();
export function estimateCost(model: string, input: number, output: number, reasoning = 0): number {
  const p = DEEPSEEK_PRICING[model] ?? DEEPSEEK_PRICING[DEFAULT_MODEL];
  return ((input + reasoning) * p.in + output * p.out) / 1_000_000;
}
export function setSessionBudget(sessionId: string, budgetUsd: number): void {
  budgets.set(sessionId, budgetUsd);
}
export type BudgetStatus = "ok" | "warn" | "abort";
export interface BudgetCheck { status: BudgetStatus; totalUsd: number; budgetUsd: number; ratio: number }
export function getSessionTotal(sessionId: string): number {
  return totals.get(sessionId) ?? 0;
}
export function checkBudget(sessionId: string): BudgetCheck {
  const budgetUsd = budgets.get(sessionId) ?? DEFAULT_SESSION_BUDGET_USD;
  const totalUsd = getSessionTotal(sessionId);
  const ratio = budgetUsd > 0 ? totalUsd / budgetUsd : 0;
  const status: BudgetStatus = ratio >= 1 ? "abort" : ratio >= WARN_RATIO ? "warn" : "ok";
  return { status, totalUsd, budgetUsd, ratio };
}
export interface RecordResult extends BudgetCheck { record: UsageRecord }
export function recordUsage(i: RecordUsageInput): RecordResult {
  const reasoningTokens = i.reasoningTokens ?? 0;
  const cost = i.estimatedCostUsd ?? estimateCost(i.model, i.inputTokens, i.outputTokens, reasoningTokens);
  const record: UsageRecord = {
    sessionId: i.sessionId, model: i.model, provider: i.provider ?? "deepseek",
    task: i.task ?? "unknown", inputTokens: i.inputTokens, outputTokens: i.outputTokens,
    reasoningTokens, estimatedCostUsd: cost, createdAt: new Date().toISOString(),
  };
  records.push(record);
  totals.set(record.sessionId, getSessionTotal(record.sessionId) + cost);
  return { record, ...checkBudget(record.sessionId) };
}
export function getSessionRecords(sessionId: string): UsageRecord[] {
  return records.filter((r) => r.sessionId === sessionId);
}
// --- Postgres-ready helpers (bring your own `pg` client; no imports here) ---
export const INSERT_USAGE_SQL =
  "INSERT INTO usage_ledger (session_id, model, provider, task, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)";
export function insertUsageParams(r: UsageRecord): (string | number)[] {
  return [r.sessionId, r.model, r.provider, r.task, r.inputTokens, r.outputTokens, r.reasoningTokens, r.estimatedCostUsd];
}
export function sessionTotalQuery(sessionId: string): { text: string; values: string[] } {
  return { text: "SELECT COALESCE(SUM(estimated_cost_usd),0) AS total_usd FROM usage_ledger WHERE session_id = $1", values: [sessionId] };
}
export function clearLedger(): void {
  records.length = 0; totals.clear();
}
