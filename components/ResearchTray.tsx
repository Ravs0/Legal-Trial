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
      {/* VERIFIED — exportable */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><ShieldCheck className="h-4 w-4" /> VERIFIED · {verified.length}</h2>
          <button onClick={exportAll} disabled={!verified.length} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"><Download className="h-3.5 w-3.5" />{done ? "Exported!" : "Export"}</button>
        </header>
        <ul className="space-y-3">
          {verified.map((c) => (
            <li key={c.id} className="rounded-lg bg-black/30 p-3 text-sm">
              <p className="font-medium text-zinc-100">{c.title}</p>
              <blockquote className="mt-1 border-l-2 border-emerald-400/60 pl-2 text-zinc-300">&ldquo;{c.quote}&rdquo;</blockquote>
              <div className="mt-2 flex items-center justify-between text-xs">
                <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-300 underline-offset-2 hover:underline"><ExternalLink className="h-3 w-3" />Source</a>
                <span className="font-mono text-zinc-400">✓ {c.verify}% · ★ {c.relevance}%</span>
              </div>
            </li>
          ))}
          {!verified.length && <li className="text-xs text-zinc-500">No verified cites yet.</li>}
        </ul>
      </div>
      {/* UNVERIFIED LEADS — watermarked, export-blocked */}
      <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" onCopy={(e) => e.preventDefault()}>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 text-2xl font-black tracking-widest text-amber-400/15">DO NOT CITE</span>
        </div>
        <header className="relative mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-300"><ShieldAlert className="h-4 w-4" /> UNVERIFIED LEADS · {leads.length}</h2>
          <button onClick={onRefetch} disabled={refetching} className="flex items-center gap-1 rounded-lg border border-amber-400/40 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refetching ? "animate-spin" : ""}`} />{refetching ? "Fetching…" : "Re-fetch"}</button>
        </header>
        <ul className="relative space-y-3">
          {leads.map((l) => (
            <li key={l.id} className="select-none rounded-lg bg-black/30 p-3 text-sm opacity-90">
              <p className="font-medium text-zinc-200">{l.title}</p>
              <p className="mt-1 text-zinc-400 blur-[0.4px]">{l.snippet}</p>
              <p className="mt-1 text-[11px] text-amber-300/80">⚠ {l.reason}</p>
            </li>
          ))}
          {!leads.length && <li className="text-xs text-zinc-500">No unverified leads. Clean run.</li>}
        </ul>
        <p className="relative mt-3 flex items-center gap-1.5 text-[11px] text-amber-200/70"><Ban className="h-3.5 w-3.5" /> Export disabled for unverified leads — verify before citing.</p>
      </div>
    </section>
  );
}
