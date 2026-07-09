import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CourtDataRecord,
  CourtDataSourceId,
  CourtDataType,
  CourtLevel,
  CourtSourceSearchParams,
  searchOfficialCourtSources,
} from '../services/courtSourcesService';

// ─── Constants ──────────────────────────────────────────────────────────────

const SOURCE_OPTIONS: { value: CourtDataSourceId | ''; label: string; short: string }[] = [
  { value: '', label: 'All Sources', short: 'ALL' },
  { value: 'sci', label: 'Supreme Court of India', short: 'SCI' },
  { value: 'ecourts_district', label: 'eCourts District Courts', short: 'DIST' },
  { value: 'ecourts_high_court', label: 'eCourts High Courts', short: 'HC' },
  { value: 'judgments_ecourts', label: 'eCourts Judgments & Orders', short: 'J&O' },
  { value: 'njdg', label: 'National Judicial Data Grid', short: 'NJDG' },
  { value: 'api_setu', label: 'API Setu', short: 'APIS' },
];

const COURT_LEVEL_OPTIONS: { value: CourtLevel | ''; label: string }[] = [
  { value: '', label: 'All levels' },
  { value: 'supreme_court', label: 'Supreme Court' },
  { value: 'high_court', label: 'High Court' },
  { value: 'district', label: 'District' },
  { value: 'aggregate', label: 'Aggregate' },
];

const DATA_TYPE_OPTIONS: { value: CourtDataType | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'case_status', label: 'Case Status' },
  { value: 'cause_list', label: 'Cause List' },
  { value: 'order', label: 'Order' },
  { value: 'judgment', label: 'Judgment' },
  { value: 'aggregate_stat', label: 'Aggregate Stats' },
  { value: 'source_reference', label: 'Source Reference' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatToken(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function accessModeMeta(mode: string) {
  if (mode === 'official_api') return { color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-400/25', label: 'API' };
  if (mode === 'aggregate_stats') return { color: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-400/25', label: 'Dashboard' };
  return { color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-400/25', label: 'Portal' };
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const SelectField: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-brand-border bg-brand-bg-dark px-3 text-xs font-medium text-brand-text-primary outline-none transition-all focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30"
    >
      {options.map((opt) => (
        <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const SourcePill: React.FC<{ selected: boolean; label: string; short: string; onClick: () => void }> = ({ selected, label, short, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
      selected
        ? 'border-brand-accent/50 bg-brand-accent/15 text-brand-accent shadow-glow-accent-sm'
        : 'border-brand-border bg-brand-bg-dark text-brand-text-secondary/70 hover:border-brand-border-light hover:text-brand-text-primary'
    }`}
  >
    <span className="hidden lg:inline">{label}</span>
    <span className="lg:hidden">{short}</span>
  </button>
);

const AccessBadge: React.FC<{ mode: string }> = ({ mode }) => {
  const meta = accessModeMeta(mode);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${meta.bg} ${meta.border} ${meta.color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
};

const SourceCard: React.FC<{ record: CourtDataRecord }> = ({ record }) => {
  const isPortal = record.provenance.retrieval_mode === 'portal_reference';
  return (
    <article className="group relative rounded-xl border border-brand-border bg-brand-bg-secondary p-5 sm:p-6 transition-all duration-300 hover:border-brand-accent/30 hover:shadow-card-hover">
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {/* Badges */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AccessBadge mode={record.provenance.retrieval_mode} />
            <span className="rounded-md border border-white/8 bg-brand-bg-dark px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/60">
              {formatToken(record.court_level)}
            </span>
            <span className="rounded-md border border-white/8 bg-brand-bg-dark px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/60">
              {formatToken(record.data_type)}
            </span>
          </div>

          {/* Title + summary */}
          <h2 className="font-serif text-lg sm:text-xl font-semibold text-brand-text-primary leading-snug group-hover:text-brand-accent transition-colors">
            {record.title}
          </h2>
          <p className="mt-2.5 text-sm leading-6 text-brand-text-secondary/80">{record.summary}</p>
        </div>

        {/* Primary CTA */}
        <a
          href={record.provenance.official_source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-bg-dark transition-all hover:bg-brand-accent-hover hover:shadow-glow-accent-sm sm:self-start"
        >
          Open Official Source
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
        </a>
      </div>

      {/* Portal warning */}
      {isPortal && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-400/15 bg-amber-500/5 px-4 py-3 text-[11px] leading-5 text-amber-200/70">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-amber-400/70"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Portal reference — use the official page directly. This screen does not bypass captcha, login, session, or anti-bot controls.</span>
        </div>
      )}

      {/* Document links */}
      {record.documents.length > 0 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {record.documents.map((doc) => (
            <a
              key={`${record.id}-${doc.title}`}
              href={doc.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link flex min-h-10 items-center justify-between gap-2.5 rounded-lg border border-white/5 bg-brand-bg-dark px-3 py-2.5 text-[11px] font-medium text-brand-text-secondary/70 transition-all hover:border-brand-accent/30 hover:bg-brand-accent/5 hover:text-brand-text-primary"
            >
              <span className="truncate">{doc.title}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-brand-accent/50 group-hover/link:text-brand-accent"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>
          ))}
        </div>
      )}
    </article>
  );
};

const StatTile: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="rounded-lg border border-white/6 bg-brand-bg-dark/50 px-3 py-3 text-center">
    <div className="text-xl font-mono font-semibold text-brand-text-primary">{value}</div>
    <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/50">{label}</div>
  </div>
);

// ─── Main Screen ────────────────────────────────────────────────────────────

const CourtSourcesScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<CourtDataSourceId | ''>('');
  const [courtLevel, setCourtLevel] = useState<CourtLevel | ''>('');
  const [dataType, setDataType] = useState<CourtDataType | ''>('');
  const [records, setRecords] = useState<CourtDataRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const params = useMemo<CourtSourceSearchParams>(
    () => ({ q: query, source, courtLevel, dataType, limit: 20 }),
    [courtLevel, dataType, query, source],
  );

  const runSearch = async (nextParams: CourtSourceSearchParams = params) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const res = await searchOfficialCourtSources(nextParams);
      if (requestId !== requestIdRef.current) return;
      setRecords(res.records);
      setWarnings(res.warnings);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Court source lookup failed.');
      setRecords([]);
      setWarnings([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    runSearch({ limit: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(params);
  };

  const handleSourceSelect = (nextSource: CourtDataSourceId | '') => {
    setSource(nextSource);
    runSearch({ q: query, source: nextSource, courtLevel, dataType, limit: 20 });
  };

  const resetFilters = () => {
    setQuery('');
    setSource('');
    setCourtLevel('');
    setDataType('');
    runSearch({ limit: 20 });
  };

  const portalCount = records.filter((r) => r.provenance.retrieval_mode === 'portal_reference').length;
  const apiCount = records.filter((r) => r.provenance.retrieval_mode === 'official_api').length;
  const aggCount = records.filter((r) => r.provenance.retrieval_mode === 'aggregate_stats').length;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-brand-bg-primary">
      {/* ─── Hero ───────────────────────────────────────────── */}
      <div className="relative border-b border-brand-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/[0.04] via-transparent to-brand-accent/[0.02]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl animate-fadeIn">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-accent/20 bg-brand-accent/8 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-brand-accent/90">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"/></svg>
                Official Indian Court Sources
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-text-primary tracking-tight">Court Sources</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-brand-text-secondary/80">
                Search official court service entry points across Supreme Court, eCourts, judgments portals, NJDG, and API Setu.
                Results are source references with provenance — not scraped live case records.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 animate-fadeInUp">
              <StatTile value={records.length} label="Sources" />
              <StatTile value={portalCount} label="Portals" />
              <StatTile value={apiCount} label="APIs" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* ─── Source Pills ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          {SOURCE_OPTIONS.map((opt) => (
            <SourcePill
              key={opt.value || 'all'}
              selected={source === opt.value}
              label={opt.label}
              short={opt.short}
              onClick={() => handleSourceSelect(opt.value)}
            />
          ))}
        </div>

        {/* ─── Search Bar ──────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
          <div className="rounded-xl border border-brand-border bg-brand-bg-secondary p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              {/* Query input */}
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">Search</span>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="CNR, party name, case type, court service..."
                    className="h-11 w-full rounded-lg border border-brand-border bg-brand-bg-dark pl-10 pr-4 text-sm text-brand-text-primary outline-none transition-all placeholder:text-brand-text-secondary/30 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30"
                  />
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                <SelectField label="Court Level" value={courtLevel} options={COURT_LEVEL_OPTIONS} onChange={(v) => setCourtLevel(v as CourtLevel | '')} />
                <SelectField label="Data Type" value={dataType} options={DATA_TYPE_OPTIONS} onChange={(v) => setDataType(v as CourtDataType | '')} />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-lg bg-brand-accent px-5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-bg-dark transition-all hover:bg-brand-accent-hover hover:shadow-glow-accent-sm disabled:opacity-50"
                >
                  {loading ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  )}
                  Search
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-10 rounded-lg border border-brand-border px-3.5 text-[11px] font-semibold text-brand-text-secondary/60 transition-all hover:border-brand-border-light hover:text-brand-text-primary"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* ─── Warnings ────────────────────────────────────── */}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-brand-accent/15 bg-brand-accent/[0.04] px-5 py-4 text-xs leading-5 text-brand-text-secondary/70 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-accent/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 16v-4m0-4h.01"/></svg>
              Compliance Notes
            </div>
            {warnings.map((w) => (
              <p key={w} className="mt-1">{w}</p>
            ))}
          </div>
        )}

        {/* ─── Results ─────────────────────────────────────── */}
        {loading && records.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-brand-border bg-brand-bg-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 text-brand-accent animate-spin"><path d="M21 12a9 9 0 11-6.22-8.56"/><path d="M21 3v6h-6"/></svg>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/50">Loading official source catalog</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-brand-error/30 bg-brand-error/10 p-6 text-center animate-fadeIn">
            <p className="text-sm font-semibold text-brand-text-primary">{error}</p>
            <button
              onClick={() => runSearch(params)}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-error/40 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-error transition-all hover:bg-brand-error/15"
            >
              Retry
            </button>
          </div>
        ) : records.length > 0 ? (
          <div className="grid gap-4">
            {records.map((record, i) => (
              <div key={record.id} className="animate-fadeInUp" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                <SourceCard record={record} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-brand-border bg-brand-bg-secondary text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 text-brand-text-secondary/15"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"/></svg>
            <p className="text-sm font-semibold text-brand-text-primary/80">No official sources matched those filters.</p>
            <p className="mt-2 max-w-md text-xs leading-5 text-brand-text-secondary/50">Clear one or more filters to view the full official-source directory.</p>
            <button
              onClick={resetFilters}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-border px-4 text-[11px] font-semibold text-brand-text-secondary/60 transition-all hover:border-brand-accent/40 hover:text-brand-text-primary"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* ─── Footer note ─────────────────────────────────── */}
        {records.length > 0 && (
          <p className="text-center text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/30 pt-4 pb-8">
            {aggCount > 0 && `NJDG aggregate stats are dashboard references, not per-case records. `}
            All source data belongs to the respective official courts and portals.
          </p>
        )}
      </div>
    </div>
  );
};

export default CourtSourcesScreen;
