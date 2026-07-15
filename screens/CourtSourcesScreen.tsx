import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CourtDataRecord,
  CourtDataSourceId,
  CourtDataType,
  CourtLevel,
  CourtSourceSearchParams,
  searchOfficialCourtSources,
} from '../services/courtSourcesService';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel } from '../components/SurfacePattern';
import { CaselawResult, IndianCourtFilter, searchCaselaw } from '../services/caselawService';
import courtroomLuxury from '../assets/courtroom_luxury.jpg';

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

const CASELAW_COURT_OPTIONS: { value: IndianCourtFilter; label: string }[] = [
  { value: 'all', label: 'All Indian courts' },
  { value: 'supreme_court', label: 'Supreme Court of India' },
  { value: 'high_courts', label: 'All High Courts' },
  { value: 'delhi_high_court', label: 'Delhi High Court' },
  { value: 'bombay_high_court', label: 'Bombay High Court' },
  { value: 'karnataka_high_court', label: 'Karnataka High Court' },
  { value: 'allahabad_high_court', label: 'Allahabad High Court' },
  { value: 'madras_high_court', label: 'Madras High Court' },
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
}> = ({ label, value, options, onChange }) => {
  const id = useId();
  return (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">{label}</label>
    <select
      id={id}
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
};

const SourcePill: React.FC<{ selected: boolean; label: string; short: string; onClick: () => void }> = ({ selected, label, short, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
      selected
        ? 'border-white bg-white text-black'
        : 'border-brand-border bg-brand-bg-secondary text-brand-text-secondary hover:border-white/20 hover:text-brand-text-primary'
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

const CaselawCard: React.FC<{ result: CaselawResult }> = ({ result }) => (
  <article className="rounded-lg border border-brand-border bg-brand-bg-primary/60 p-4 transition-colors hover:border-brand-accent/30">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-serif text-[15px] font-semibold leading-snug text-brand-text-primary">{result.title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-wide text-brand-text-secondary/65">
          {result.citation && <span>{result.citation}</span>}
          {result.court && <span>{result.court}</span>}
          {result.date && <span>{result.date}</span>}
        </div>
      </div>
      <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-brand-border px-3 text-[11px] font-semibold text-brand-text-primary hover:border-brand-accent/40 hover:text-brand-accent">
        Open judgment
      </a>
    </div>
    {result.snippet && <p className="mt-3 text-[12px] leading-5 text-brand-text-secondary/80 line-clamp-4">{result.snippet}</p>}
  </article>
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
  const [caselawQuery, setCaselawQuery] = useState('');
  const [caselawCourt, setCaselawCourt] = useState<IndianCourtFilter>('all');
  const [caselawFromDate, setCaselawFromDate] = useState('');
  const [caselawToDate, setCaselawToDate] = useState('');
  const [caselawResults, setCaselawResults] = useState<CaselawResult[]>([]);
  const [caselawLoading, setCaselawLoading] = useState(false);
  const [caselawMessage, setCaselawMessage] = useState<string | null>(null);
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

  const handleCaselawSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!caselawQuery.trim()) return;
    setCaselawLoading(true);
    setCaselawMessage(null);
    try {
      const response = await searchCaselaw(caselawQuery, 'indian', 12, 0, {
        court: caselawCourt,
        fromDate: caselawFromDate || undefined,
        toDate: caselawToDate || undefined,
      });
      setCaselawResults(response.results);
      setCaselawMessage(response.message || (response.results.length ? null : 'No live judgments matched those filters.'));
    } catch (err) {
      setCaselawResults([]);
      setCaselawMessage(err instanceof Error ? err.message : 'Live case-law search failed.');
    } finally {
      setCaselawLoading(false);
    }
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
    <div className="flex-1 min-h-0 h-full overflow-y-auto overflow-x-hidden bg-brand-bg-primary w-full">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-5 sm:py-6 space-y-5">
        <PhotoHero
          image={courtroomLuxury}
          size="md"
          eyebrow="Research · Indian courts"
          title="Court sources"
          subtitle="Official entry points: SCI, eCourts, judgments, NJDG, API Setu. Provenance-first references, not scraped dockets."
          actions={
            <div className="flex gap-2">
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">{records.length} sources</span>
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">{portalCount} portals</span>
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">{apiCount} APIs</span>
            </div>
          }
        />

        {/* ─── Source Pills ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
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

        <form onSubmit={handleCaselawSearch}>
          <PatternPanel pattern="lines" className="p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-text-primary">Live case-law research</p>
                <p className="text-[12px] leading-5 text-brand-text-secondary/75">Search current Supreme Court and High Court judgments through Indian Kanoon’s authenticated API. Results are research leads—open and verify the linked primary judgment before relying on it.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_150px_150px_auto] lg:items-end">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="caselaw-query" className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">Issue or authority</label>
                  <input id="caselaw-query" value={caselawQuery} onChange={(event) => setCaselawQuery(event.target.value)} placeholder="e.g. bail cancellation, arbitral award public policy" className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-sm text-brand-text-primary outline-none placeholder:text-brand-text-secondary/40 focus:border-brand-accent" />
                </div>
                <SelectField label="Court" value={caselawCourt} options={CASELAW_COURT_OPTIONS} onChange={(value) => setCaselawCourt(value as IndianCourtFilter)} />
                <div className="flex flex-col gap-1.5"><label htmlFor="caselaw-from" className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">From</label><input id="caselaw-from" type="date" value={caselawFromDate} onChange={(event) => setCaselawFromDate(event.target.value)} className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-xs text-brand-text-primary" /></div>
                <div className="flex flex-col gap-1.5"><label htmlFor="caselaw-to" className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">To</label><input id="caselaw-to" type="date" value={caselawToDate} onChange={(event) => setCaselawToDate(event.target.value)} className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-xs text-brand-text-primary" /></div>
                <button type="submit" disabled={caselawLoading || !caselawQuery.trim()} className="min-h-10 rounded-lg bg-white px-4 text-[12px] font-semibold text-black hover:bg-white/90 disabled:opacity-50">{caselawLoading ? 'Searching…' : 'Find cases'}</button>
              </div>
              {caselawMessage && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-200/80">{caselawMessage}</p>}
              {caselawResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/60">{caselawResults.length} live results · Powered by Indian Kanoon</p>
                  {caselawResults.map((result) => <CaselawCard key={result.docid || result.url} result={result} />)}
                </div>
              )}
            </div>
          </PatternPanel>
        </form>

        {/* ─── Search Bar ──────────────────────────────────── */}
        <form onSubmit={handleSubmit}>
          <PatternPanel pattern="dots" className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              {/* Query input */}
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary">Search</span>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="CNR, party name, case type, court service..."
                    className="h-11 w-full rounded-lg border border-brand-border bg-brand-bg-primary pl-10 pr-4 text-sm text-brand-text-primary outline-none transition-all placeholder:text-brand-text-secondary/40 focus:border-white/25 focus:ring-1 focus:ring-white/10"
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
                  className="inline-flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-lg bg-white px-5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
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
                  className="h-10 rounded-lg border border-brand-border px-3.5 text-[12px] text-brand-text-secondary transition-colors hover:border-white/20 hover:text-brand-text-primary"
                >
                  Reset
                </button>
              </div>
            </div>
          </PatternPanel>
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
