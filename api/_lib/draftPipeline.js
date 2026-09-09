'use strict';
// LexForge 3-pass drafting: drafter -> critic (IRAC/citation) -> formatter (ILI/OSCOLA).
const { route } = require('./router');
const { checkBudget, spend } = require('./budget');
const { withFallback } = require('./fallback');

const PASSES = {
  drafter: { model: 'gpt-4o', temperature: 0.7, timeoutMs: 45000 },
  critic: { model: 'gpt-4o-mini', temperature: 0.2, timeoutMs: 25000 },
  formatter: { model: 'gpt-4o-mini', temperature: 0.1, timeoutMs: 25000 },
};

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('pass-timeout')), ms))]);

async function runPass(name, prompt, ctx) {
  const cfg = { ...PASSES[name], ...(ctx.passOpts?.[name] || {}) }; // per-pass model/temp/timeout override
  if (!checkBudget(ctx.budget, cfg.model)) throw new Error(`${name}-budget-exceeded`);
  const res = await withTimeout(withFallback((m) => route(m, prompt, { ...cfg, model: m }), cfg.model), cfg.timeoutMs);
  spend(ctx.budget, cfg.model, res.usage); // no-op if usage undefined
  return typeof res === 'string' ? res : res.text;
}

function merge(draft, critique, formatted) {
  // Merge rule: drafter substance wins; critic fixes merged iff non-contradicting
  // (no holding/outcome flip); formatter wins on citation style/footnotes/headings.
  const notes = [];
  let text = formatted || draft;
  for (const f of critique?.fixes || []) {
    if (/holding|outcome|conclusion/i.test(f.scope || '') && f.contradictsDraft) { notes.push(`rejected: ${f.fix}`); continue; }
    if (f.fix && !text.includes(f.fix)) { text += `\n\n[critic-fix: ${f.fix}]`; notes.push(`applied: ${f.fix}`); }
  }
  return { text, notes };
}

async function runDraftPipeline({ issue, facts = '', authorities = [], style = 'ILI', skipCritic = false, ctx = {} }) {
  const context = { budget: ctx.budget || {}, passOpts: ctx.passOpts || {}, warnings: [] };
  const draft = await runPass('drafter', `Draft IRAC memo on: ${issue}\nFacts: ${facts}\nAuthorities: ${authorities.join('; ')}`, context);
  let critique = { issues: [], fixes: [] };
  let degraded = false;
  if (!skipCritic) {
    try {
      const raw = await runPass('critic', `IRAC+citation check. Return JSON {issues[],fixes[{scope,fix,contradictsDraft}]}.\nSTYLE=${style}\nDRAFT:\n${draft}`, context);
      critique = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
      critique.fixes ||= []; critique.issues ||= [];
    } catch (e) { degraded = true; context.warnings.push(`critic-skipped: ${e.message}`); } // skip-critic degrade
  } else { degraded = true; context.warnings.push('critic-skipped: caller-opt-out'); }
  const formatted = await runPass('formatter', `Format to ${style === 'OSCOLA' ? 'OSCOLA' : 'ILI'} (footnotes, headings). Apply fixes: ${JSON.stringify(critique.fixes)}\n${draft}`, context);
  const { text, notes } = merge(draft, critique, formatted);
  return { text, degraded, issues: critique.issues, notes, warnings: context.warnings, passes: ['drafter', degraded ? null : 'critic', 'formatter'].filter(Boolean) };
}

module.exports = { runDraftPipeline, runPass, merge, PASSES };
