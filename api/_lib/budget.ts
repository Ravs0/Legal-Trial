export type Phase = "research" | "draft" | "critic" | "merge";

export interface Budget {
  turnTokenCap: number; // max tokens per turn
  sessionSpendUsd: number; // hard cap; abort at >= 100%
  timeouts: Record<Phase, number>; // per-phase timeout, ms
  warnAt?: number; // default 0.8
  critSkipAt?: number; // default 0.9
}

export interface Usage { spentUsd: number; turnTokens: number; }
export interface Gate { proceed: boolean; warn: boolean; skipCritic: boolean; reason?: string; }
export interface Degraded { skipCritic: boolean; maxTokens: number; model: string; }

export class BudgetExceeded extends Error {
  constructor(spent: number, cap: number) {
    super(`session cap exceeded: $${spent.toFixed(4)} >= $${cap.toFixed(4)}`);
    this.name = "BudgetExceeded";
  }
}

export const WARN_AT = 0.8;
export const CRIT_SKIP_AT = 0.9;
export const CHEAP_MODEL = "gpt-4o-mini";
export const CRITIC_TOKENS = 512;

export const ratio = (u: Usage, b: Budget): number =>
  b.sessionSpendUsd <= 0 ? 1 : u.spentUsd / b.sessionSpendUsd;

// Gate a phase: throws BudgetExceeded on session-cap (abort).
export function before_phase(b: Budget, phase: Phase, u: Usage, elapsedMs: number): Gate {
  const r = ratio(u, b);
  if (r >= 1) throw new BudgetExceeded(u.spentUsd, b.sessionSpendUsd);
  const warn = r >= (b.warnAt ?? WARN_AT);
  const skipCritic = r >= (b.critSkipAt ?? CRIT_SKIP_AT);
  if (elapsedMs > (b.timeouts[phase] ?? Infinity))
    return { proceed: false, warn: true, skipCritic, reason: `timeout: ${phase} > ${b.timeouts[phase]}ms` };
  if (u.turnTokens > b.turnTokenCap)
    return { proceed: false, warn: true, skipCritic, reason: `turn cap: ${u.turnTokens} > ${b.turnTokenCap}` };
  if (phase === "critic" && skipCritic)
    return { proceed: false, warn, skipCritic, reason: `critic skipped at ${(r * 100).toFixed(0)}% spend` };
  return { proceed: true, warn, skipCritic };
}

// Degrade under pressure: skip critic, cap max_tokens, cheap model.
export function degrade(b: Budget, u: Usage, maxTokens: number, model: string): Degraded {
  if (ratio(u, b) < (b.critSkipAt ?? CRIT_SKIP_AT)) return { skipCritic: false, maxTokens, model };
  return { skipCritic: true, maxTokens: Math.min(maxTokens, CRITIC_TOKENS), model: CHEAP_MODEL };
}

// Pure spend accounting.
export const track = (u: Usage, tokens: number, costUsd: number): Usage =>
  ({ spentUsd: u.spentUsd + costUsd, turnTokens: u.turnTokens + tokens });
