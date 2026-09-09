import { useState } from "react";
import { ShieldCheck, ShieldAlert, ExternalLink, Download, RefreshCw, Ban } from "lucide-react";

export type VerifiedCite = { id: string; title: string; quote: string; url: string; verify: number; relevance: number };
export type UnverifiedLead = { id: string; title: string; snippet: string; reason: string };

type Props = { verified: VerifiedCite[]; leads: UnverifiedLead[]; onExport?: (v: VerifiedCite[]) => void; onRefetch?: () => void; refetching?: boolean };

export default function ResearchTray({ verified, leads, onExport, onRefetch, refetching }: Props) {
  const [done, setDone] = useState(false);
  const exportAll = () => { onExport?.(verified); setDone(true); setTimeout(() => setDone(false), 2000); };
  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label="Precedent research tray">
      <div className="rounded border border-brand-border bg-brand-bg-secondary p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-brand-text-primary"><ShieldCheck className="h-4 w-4" /> VERIFIED · {verified.length}</h2>
          <button onClick={exportAll} disabled={!verified.length} className="flex items-center gap-1 rounded border border-brand-text-primary bg-brand-text-primary px-2.5 py-1.5 font-sans text-xs font-semibold text-brand-bg-primary transition hover:bg-brand-navy-light disabled:opacity-40"><Download className="h-3.5 w-3.5" />{done ? "Exported" : "Export"}</button>
        </header>
        <ul className="space-y-3">
          {verified.map((c) => (
            <li key={c.id} className="rounded border border-brand-border bg-brand-bg-primary p-3 text-sm">
              <p className="font-serif font-medium text-brand-text-primary">{c.title}</p>
              <blockquote className="mt-1 border-l-2 border-brand-border-light pl-2 text-brand-text-secondary">&ldquo;{c.quote}&rdquo;</blockquote>
              <div className="mt-2 flex items-center justify-between text-xs">
                <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-text-primary underline underline-offset-2 hover:opacity-80"><ExternalLink className="h-3 w-3" />Source</a>
                <span className="font-mono text-brand-text-secondary">{c.verify}% / {c.relevance}%</span>
              </div>
            </li>
          ))}
          {!verified.length && <li className="text-xs text-brand-text-secondary">No verified cites yet.</li>}
        </ul>
      </div>
      <div className="relative overflow-hidden rounded border border-dashed border-brand-border-light bg-brand-bg-tertiary p-4" onCopy={(e) => e.preventDefault()}>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 font-serif text-2xl font-black tracking-widest text-brand-text-primary/10">DO NOT CITE</span>
        </div>
        <header className="relative mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-brand-text-secondary"><ShieldAlert className="h-4 w-4" /> UNVERIFIED LEADS · {leads.length}</h2>
          <button onClick={onRefetch} disabled={refetching} className="flex items-center gap-1 rounded border border-brand-border-light bg-brand-bg-secondary px-2.5 py-1.5 font-sans text-xs font-semibold text-brand-text-primary transition hover:border-brand-text-primary disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refetching ? "animate-spin" : ""}`} />{refetching ? "Fetching" : "Re-fetch"}</button>
        </header>
        <ul className="relative space-y-3">
          {leads.map((l) => (
            <li key={l.id} className="select-none rounded border border-brand-border bg-brand-bg-secondary p-3 text-sm opacity-90">
              <p className="font-serif font-medium text-brand-text-primary">{l.title}</p>
              <p className="mt-1 text-brand-text-secondary blur-[0.4px]">{l.snippet}</p>
              <p className="mt-1 font-mono text-[11px] text-brand-text-secondary">{l.reason}</p>
            </li>
          ))}
          {!leads.length && <li className="text-xs text-brand-text-secondary">No unverified leads. Clean run.</li>}
        </ul>
        <p className="relative mt-3 flex items-center gap-1.5 text-[11px] text-brand-text-secondary"><Ban className="h-3.5 w-3.5" /> Export disabled for unverified leads. Verify before citing.</p>
      </div>
    </section>
  );
}
