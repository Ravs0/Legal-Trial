// LexForge interviewRunner: Docassemble-style YAML subset (question/fields/code/mandatory/attachment). Zero deps.
export interface Field { label: string; var: string; datatype?: string }
export interface QBlock { id: string; question: string; subquestion?: string; fields: Field[] }
export interface Attachment { name: string; template: string }
export interface Interview { questions: QBlock[]; codes: string[]; mandatory: string[]; attachments: Attachment[] }
const varsIn = (s: string): string[] => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
const val = (b: string, k: string): string | null => {
  const v = b.match(new RegExp("^\\s*" + k + ":\\s*(.*?)\\s*$", "m"))?.[1]?.trim();
  return v ? v : null;
};
function fieldsOf(b: string): Field[] {
  const out: Field[] = [];
  for (const ln of b.split("\n")) {
    const m = ln.match(/^\s*-\s*([^:]+):\s*(\w+)\s*$/);
    if (m) { out.push({ label: m[1].trim(), var: m[2] }); continue; }
    const d = ln.match(/^\s*datatype:\s*(\w+)\s*$/);
    if (d && out.length) out[out.length - 1].datatype = d[1];
  }
  return out;
}
function lit(b: string, k: string): string { // literal `k: |` block (code/template); falls back to inline value
  const m = b.match(new RegExp("^\\s*" + k + ":\\s*\\|\\s*\\n((?:[ \\t]+.*\\n?)+)", "m"));
  if (m) return m[1].replace(/^[ \\t]+/gm, "").replace(/\s+$/, "");
  return val(b, k) ?? "";
}
export function parseInterview(yaml: string): Interview {
  const iv: Interview = { questions: [], codes: [], mandatory: [], attachments: [] };
  for (const b of yaml.split(/^---\s*$/m)) {
    if (/^\s*question:/m.test(b)) iv.questions.push({ id: `q${iv.questions.length + 1}`,
      question: val(b, "question") ?? "", subquestion: val(b, "subquestion") ?? undefined, fields: fieldsOf(b) });
    else if (/^\s*code:/m.test(b)) { const c = lit(b, "code"); if (c) iv.codes.push(c); }
    else if (/^\s*mandatory:/m.test(b)) { const v = val(b, "mandatory"); if (v && v !== "True") iv.mandatory.push(v); }
    else if (/^\s*attachment:/m.test(b)) iv.attachments.push({ name: val(b, "name") ?? "attachment",
      template: lit(b, "template") || lit(b, "content") });
  }
  return iv;
}
export function orderQuestions(iv: Interview): QBlock[] { // topo-order by {{var}} refs; cycle → author order
  const prod = new Map<string, number>();
  iv.questions.forEach((q, i) => q.fields.forEach((f) => { if (!prod.has(f.var)) prod.set(f.var, i); }));
  const edges: Set<number>[] = iv.questions.map(() => new Set()), indeg = iv.questions.map(() => 0);
  iv.questions.forEach((q, i) => {
    for (const v of varsIn(q.question + " " + (q.subquestion ?? ""))) {
      const p = prod.get(v);
      if (p !== undefined && p !== i && !edges[p].has(i)) { edges[p].add(i); indeg[i]++; }
    }
  });
  const ready = indeg.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
  const out: QBlock[] = [];
  while (ready.length) { const i = ready.shift()!; out.push(iv.questions[i]);
    for (const j of edges[i]) if (--indeg[j] === 0) ready.push(j); }
  return out.length === iv.questions.length ? out : iv.questions;
}
export function runCodes(iv: Interview, a: Record<string, any>): Record<string, any> { // `var = expr` lines in scope
  const out = { ...a };
  for (const code of iv.codes) for (const ln of code.split("\n")) {
    const m = ln.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    try { out[m[1]] = new Function(...Object.keys(out), `return (${m[2]});`)(...Object.values(out)); } catch { /* skip */ }
  }
  return out;
}
export function nextQuestion(iv: Interview, a: Record<string, any>): QBlock | null { // first q with unanswered field
  const full = runCodes(iv, a);
  return orderQuestions(iv).find((q) => q.fields.some((f) => full[f.var] === undefined || full[f.var] === "")) ?? null;
}
export const answer = (a: Record<string, any>, k: string, v: any): Record<string, any> => ({ ...a, [k]: v });
export function collectAnswers(iv: Interview, provided: Record<string, any>): { answers: Record<string, any>; pending: QBlock | null } {
  const answers = runCodes(iv, { ...provided });
  return { answers, pending: nextQuestion(iv, answers) };
}
// {{var}} preview: for real .docx, unzip word/document.xml and run it through renderPreview.
export const renderPreview = (tpl: string, a: Record<string, any>): string =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v: string) => String(a[v] ?? ""));
export function isComplete(iv: Interview, a: Record<string, any>): boolean {
  const f = runCodes(iv, a);
  return !nextQuestion(iv, a) && iv.mandatory.every((m) => f[m] !== undefined && f[m] !== "");
}
