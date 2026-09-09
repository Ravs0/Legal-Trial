import { useMemo, useState } from "react";
import { collectAnswers, nextQuestion, orderQuestions, parseInterview, renderPreview } from "../services/interviewRunner";

export function InterviewForm({ interviewYaml }: { interviewYaml: string }) {
  const iv = useMemo(() => parseInterview(interviewYaml), [interviewYaml]);
  const [committed, setCommitted] = useState<Record<string, string>>({});
  const { answers: full } = collectAnswers(iv, committed);
  const q = nextQuestion(iv, committed);
  const ordered = orderQuestions(iv);
  const total = ordered.length || 1;
  const idx = q ? ordered.findIndex((s) => s.id === q.id) : ordered.length;
  const tpl = iv.attachments[0]?.template ?? "";
  const preview = renderPreview(tpl, full);
  const pct = Math.round(((q ? idx : total) / total) * 100);
  const goBack = () => {
    const prev = ordered[q ? idx - 1 : total - 1];
    if (!prev) return;
    const next = { ...committed };
    prev.fields.forEach((f) => delete next[f.var]);
    setCommitted(next);
  };
  if (!q) {
    return (
      <div className="rounded-md bg-brand-bg-secondary border border-brand-border p-5 font-serif">
        <p className="text-[13px] text-brand-text-secondary">Step {total} of {total} complete</p>
        <h2 className="mt-1 text-lg text-brand-text-primary">Intake complete</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-brand-bg-tertiary border border-brand-border p-3 font-mono text-[12px] text-brand-text-primary">{preview || "No draft template found."}</pre>
        <button type="button" onClick={() => setCommitted({})} className="mt-4 rounded-md border border-brand-border px-4 py-2 font-sans text-[13px] text-brand-text-primary hover:border-brand-border-light">Start over</button>
      </div>
    );
  }
  return (
    <div className="grid gap-4 font-serif md:grid-cols-2">
      <div className="rounded-md bg-brand-bg-secondary border border-brand-border p-5">
        <p className="text-[13px] text-brand-text-secondary">Step {idx + 1} of {total}</p>
        <div className="mt-2 h-1 rounded-md bg-brand-bg-tertiary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1 rounded-md bg-brand-text-primary" style={{ width: `${pct}%` }} />
        </div>
        <h2 className="mt-3 text-lg text-brand-text-primary">{renderPreview(q.question, full)}</h2>
        {q.subquestion && <p className="mt-1 text-[13px] text-brand-text-secondary">{q.subquestion}</p>}
        <form
          key={q.id}
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const next = { ...committed };
            q.fields.forEach((f) => { next[f.var] = String(fd.get(f.var) ?? "").trim(); });
            setCommitted(next);
          }}
        >
          {q.fields.map((f) => (
            <label key={f.var} className="grid gap-1 text-[13px] text-brand-text-primary">
              {f.label}
              <input name={f.var} defaultValue={committed[f.var] ?? ""} required type={f.datatype === "integer" ? "number" : "text"} className="rounded-md bg-brand-bg-tertiary border border-brand-border px-3 py-2 font-sans text-[13px] text-brand-text-primary" />
            </label>
          ))}
          <div className="mt-1 flex gap-2">
            {idx > 0 && <button type="button" onClick={goBack} className="rounded-md border border-brand-border px-4 py-2 font-sans text-[13px] text-brand-text-primary hover:border-brand-border-light">Back</button>}
            <button type="submit" className="rounded-md bg-brand-text-primary px-4 py-2 font-sans text-[13px] text-brand-bg-primary">Continue</button>
          </div>
        </form>
      </div>
      <div className="rounded-md bg-brand-bg-secondary border border-brand-border p-5">
        <p className="text-[13px] text-brand-text-secondary">Live preview</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-brand-bg-tertiary border border-brand-border p-3 font-mono text-[12px] text-brand-text-primary">{preview || "Answer to fill the draft."}</pre>
      </div>
    </div>
  );
}
