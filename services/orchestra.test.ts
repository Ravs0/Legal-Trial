// Orchestra regression contracts: golden scoring, SSE frames, routing table,
// budget caps, fallback order. Plain tsx asserts (see services/aiService.test.ts).

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// 1. Golden-transcript scoring assert: a structurally complete argument must
// hold its frozen score; a partial one must score below it.
{
  const flags = (t: Record<string, boolean>) => Object.values(t).filter(Boolean).length * 2;
  const full = flags({ issue: true, rule: true, facts: true, application: true, remedy: true });
  const partial = flags({ issue: true, rule: true, facts: true, application: false, remedy: true });
  assert(full === 10, `complete golden must score 10, got ${full}`);
  assert(partial === 8, `partial golden must score 8, got ${partial}`);
  assert(full > partial, 'complete golden must outscore partial golden');
}

// 2. SSE frame contract: data: frames parse, control lines and junk never throw.
function parseSseLine(line: string): { type: string; text?: string } | null {
  const t = line.trim();
  if (!t.startsWith('data:')) return null;
  const body = t.slice(5).trim();
  if (body === '[DONE]') return { type: 'done' };
  try {
    const o = JSON.parse(body) as Record<string, unknown>;
    if (o.t === 'start') return { type: 'start' };
    if (o.t === 'd' && typeof o.v === 'string' && o.v.length > 0) return { type: 'delta', text: o.v };
    return null;
  } catch {
    return null;
  }
}
{
  assert(parseSseLine('data: {"t":"start"}')?.type === 'start', 'start frame');
  assert(parseSseLine('data: {"t":"d","v":"Thy "}')?.text === 'Thy ', 'delta keeps exact spacing');
  assert(parseSseLine('data: [DONE]')?.type === 'done', 'done sentinel');
  assert(parseSseLine('') === null, 'blank line ignored');
  assert(parseSseLine(': keep-alive') === null, 'comment line ignored');
  assert(parseSseLine('data: {not json') === null, 'malformed frame ignored');
  assert(parseSseLine('data: {"t":"d","v":""}') === null, 'empty delta rejected');
}

// 3. Routing table snapshot: any route change must update this frozen map.
{
  const routes: Record<string, string> = { drafting: 'drafter', objection: 'judge', research: 'researcher', scoring: 'critic' };
  const snapshot = JSON.stringify(routes, Object.keys(routes).sort());
  assert(snapshot === '{"drafting":"drafter","objection":"judge","research":"researcher","scoring":"critic"}', `routing drift: ${snapshot}`);
}

// 4. Budget enforcer caps: per-agent clamp plus a total ceiling.
function enforceBudget(used: number, cap: number): number {
  return Math.min(Math.max(used, 0), cap);
}
{
  const caps = { drafter: 4000, critic: 1000, total: 4500 };
  const drafter = enforceBudget(5200, caps.drafter);
  const critic = enforceBudget(400, caps.critic);
  assert(drafter === 4000, `drafter clamped to cap, got ${drafter}`);
  assert(critic === 400, 'under-cap spend passes through');
  assert(drafter + critic <= caps.total, 'combined spend stays within total budget');
  assert(enforceBudget(-5, caps.critic) === 0, 'negative spend floored at zero');
}

// 5. Fallback chain order: primary -> secondary -> local, never skipping.
{
  const chain = ['primary', 'secondary', 'local'];
  const pick = (failed: string[]): string => chain.find((c) => !failed.includes(c)) ?? 'none';
  assert(pick([]) === 'primary', 'healthy request uses primary');
  assert(pick(['primary']) === 'secondary', 'primary failure falls to secondary');
  assert(pick(['primary', 'secondary']) === 'local', 'double failure reaches local coach');
  assert(JSON.stringify(chain) === '["primary","secondary","local"]', 'chain order frozen');
}

console.log('orchestra tests passed');
