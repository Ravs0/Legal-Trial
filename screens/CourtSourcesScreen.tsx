import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CourtDataRecord,
  CourtDataSourceId,
  CourtDataType,
  CourtLevel,
  CourtSourceSearchParams,
  CourtSourcesServiceError,
  describeCourtSourceFilters,
  isCourtSourcesAbortError,
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatToken(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isIsoDate(value: string): boolean {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Monochrome access badges (design.md: no traffic-light green / sky / amber cast). */
function accessModeMeta(mode: string) {
  if (mode === 'official_api') {
    return { color: 'text-white', bg: 'bg-white/10', border: 'border-white/25', label: 'API' };
  }
  if (mode === 'aggregate_stats') {
    return {
      color: 'text-brand-text-secondary',
      bg: 'bg-white/5',
      border: 'border-white/15',
      label: 'Dashboard',
    };
  }
  if (mode === 'public_artifact') {
    return {
      color: 'text-brand-text-secondary',
      bg: 'bg-brand-bg-dark',
      border: 'border-brand-border',
      label: 'Artifact',
    };
  }
  return {
    color: 'text-brand-text-secondary',
    bg: 'bg-brand-bg-dark',
    border: 'border-brand-border',
    label: 'Portal',
  };
}

function humanizeFilterError(err: unknown, activeFilters: string): string {
  if (err instanceof CourtSourcesServiceError) {
    if (err.code === 'validation') {
      return `${err.message} Active filters: ${activeFilters}.`;
    }
    if (err.code === 'network') {
      return `${err.message} Check your connection and try again.`;
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Court source lookup failed.';
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
      <label htmlFor={id} className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-brand-border bg-brand-bg-dark px-3 text-xs font-medium text-brand-text-primary outline-none transition-all focus:border-white/25 focus:ring-1 focus:ring-white/10"
      >
        {options.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const SourcePill: React.FC<{ selected: boolean; label: string; short: string; onClick: () => void }> = ({
  selected,
  label,
  short,
  onClick,
}) => (
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${meta.bg} ${meta.border} ${meta.color}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
};

const SourceCard: React.FC<{ record: CourtDataRecord }> = ({ record }) => {
  const isPortal = record.provenance.retrieval_mode === 'portal_reference';
  return (
    <article className="group relative rounded-xl border border-brand-border bg-brand-bg-secondary p-5 sm:p-6 transition-all duration-300 hover:border-white/20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AccessBadge mode={record.provenance.retrieval_mode} />
            <span className="rounded-md border border-white/8 bg-brand-bg-dark px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/60">
              {formatToken(record.court_level)}
            </span>
            <span className="rounded-md border border-white/8 bg-brand-bg-dark px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/60">
              {formatToken(record.data_type)}
            </span>
          </div>

          <h2 className="font-serif text-lg sm:text-xl font-semibold text-brand-text-primary leading-snug group-hover:text-white transition-colors">
            {record.title}
          </h2>
          <p className="mt-2.5 text-sm leading-6 text-brand-text-secondary/80">{record.summary}</p>
        </div>

        <a
          href={record.provenance.official_source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-white/90 sm:self-start"
        >
          Open Official Source
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </a>
      </div>

      {isPortal && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-brand-border bg-brand-bg-dark/80 px-4 py-3 text-[11px] leading-5 text-brand-text-secondary/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 shrink-0 text-brand-text-secondary/70"
          >
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Portal reference. Use the official page directly. This screen does not bypass captcha, login, session, or
            anti-bot controls.
          </span>
        </div>
      )}

      {record.documents.length > 0 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {record.documents.map((doc, index) => (
            <a
              key={`${record.id}-${doc.official_url || doc.title}-${index}`}
              href={doc.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link flex min-h-10 items-center justify-between gap-2.5 rounded-lg border border-white/5 bg-brand-bg-dark px-3 py-2.5 text-[11px] font-medium text-brand-text-secondary/70 transition-all hover:border-white/20 hover:bg-white/5 hover:text-brand-text-primary"
            >
              <span className="truncate">{doc.title}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0 text-brand-text-secondary/40 group-hover/link:text-white"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </article>
  );
};

const CaselawCard: React.FC<{ result: CaselawResult }> = ({ result }) => (
  <article className="rounded-lg border border-brand-border bg-brand-bg-primary/60 p-4 transition-colors hover:border-white/20">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-serif text-[15px] font-semibold leading-snug text-brand-text-primary">{result.title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-wide text-brand-text-secondary/65">
          {result.citation && <span>{result.citation}</span>}
          {result.court && <span>{result.court}</span>}
          {result.date && <span>{result.date}</span>}
          {result.source && <span>{result.source}</span>}
        </div>
      </div>
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-brand-border px-3 text-[11px] font-semibold text-brand-text-primary hover:border-white/25 hover:bg-white/5"
      >
        Open judgment
      </a>
    </div>
    {result.snippet && (
      <p className="mt-3 text-[12px] leading-5 text-brand-text-secondary/80 line-clamp-4">{result.snippet}</p>
    )}
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

  const sourceAbortRef = useRef<AbortController | null>(null);
  const caselawAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const params = useMemo<CourtSourceSearchParams>(
    () => ({ q: query, source, courtLevel, dataType, limit: 20 }),
    [courtLevel, dataType, query, source],
  );

  const activeFilterLabel = useMemo(() => describeCourtSourceFilters(params), [params]);

  const cancelSourceSearch = useCallback(() => {
    if (sourceAbortRef.current) {
      sourceAbortRef.current.abort();
      sourceAbortRef.current = null;
    }
  }, []);

  const cancelCaselawSearch = useCallback(() => {
    if (caselawAbortRef.current) {
      caselawAbortRef.current.abort();
      caselawAbortRef.current = null;
    }
  }, []);

  const runSearch = useCallback(
    async (nextParams: CourtSourceSearchParams = params) => {
      cancelSourceSearch();
      const controller = new AbortController();
      sourceAbortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await searchOfficialCourtSources({
          ...nextParams,
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        setRecords(res.records);
        setWarnings(res.warnings);
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted || isCourtSourcesAbortError(err)) {
          return;
        }
        setError(humanizeFilterError(err, describeCourtSourceFilters(nextParams)));
        setRecords([]);
        setWarnings([]);
      } finally {
        if (sourceAbortRef.current === controller) {
          sourceAbortRef.current = null;
        }
        if (mountedRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [cancelSourceSearch, params],
  );

  useEffect(() => {
    mountedRef.current = true;
    runSearch({ limit: 20 });
    return () => {
      mountedRef.current = false;
      cancelSourceSearch();
      cancelCaselawSearch();
    };
    // Initial catalog load only.
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

  const validateCaselawFilters = (): string | null => {
    if (!caselawQuery.trim()) {
      return 'Enter a case name, citation, or legal issue to search.';
    }
    if (caselawFromDate && !isIsoDate(caselawFromDate)) {
      return 'From date is invalid. Use YYYY-MM-DD.';
    }
    if (caselawToDate && !isIsoDate(caselawToDate)) {
      return 'To date is invalid. Use YYYY-MM-DD.';
    }
    if (caselawFromDate && caselawToDate && caselawFromDate > caselawToDate) {
      return 'Date range is invalid: From must be on or before To.';
    }
    return null;
  };

  const handleCaselawSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const filterError = validateCaselawFilters();
    if (filterError) {
      setCaselawResults([]);
      setCaselawMessage(filterError);
      return;
    }

    cancelCaselawSearch();
    const controller = new AbortController();
    caselawAbortRef.current = controller;

    setCaselawLoading(true);
    setCaselawMessage(null);

    try {
      const response = await searchCaselaw(caselawQuery, 'indian', 12, 0, {
        court: caselawCourt,
        fromDate: caselawFromDate || undefined,
        toDate: caselawToDate || undefined,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setCaselawResults(response.results);
      const filterBits = [
        caselawCourt !== 'all' ? `court=${caselawCourt}` : null,
        caselawFromDate ? `from=${caselawFromDate}` : null,
        caselawToDate ? `to=${caselawToDate}` : null,
      ].filter(Boolean);
      if (response.message) {
        setCaselawMessage(
          filterBits.length
            ? `${response.message} Filters: ${filterBits.join(', ')}.`
            : response.message,
        );
      } else if (!response.results.length) {
        setCaselawMessage(
          filterBits.length
            ? `No live judgments matched those filters (${filterBits.join(', ')}).`
            : 'No live judgments matched those filters.',
        );
      } else {
        setCaselawMessage(null);
      }
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (err instanceof Error && /cancelled/i.test(err.message)) return;
      setCaselawResults([]);
      const base = err instanceof Error ? err.message : 'Live case-law search failed.';
      setCaselawMessage(
        caselawCourt !== 'all' || caselawFromDate || caselawToDate
          ? `${base} Check court and date filters, then retry.`
          : base,
      );
    } finally {
      if (caselawAbortRef.current === controller) {
        caselawAbortRef.current = null;
      }
      if (mountedRef.current && !controller.signal.aborted) {
        setCaselawLoading(false);
      }
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
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">
                {records.length} sources
              </span>
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">
                {portalCount} portals
              </span>
              <span className="px-2.5 py-1 rounded-md border border-white/20 bg-black/40 text-[12px] text-white/80 tabular-nums">
                {apiCount} APIs
              </span>
            </div>
          }
        />

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
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-text-primary">
                  Live case-law research
                </p>
                <p className="text-[12px] leading-5 text-brand-text-secondary/75">
                  Search Supreme Court and High Court judgment leads. With an authenticated database, court and date
                  filters are structured; without one, public-web results are clearly marked for manual verification.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_150px_150px_auto] lg:items-end">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="caselaw-query"
                    className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60"
                  >
                    Issue or authority
                  </label>
                  <input
                    id="caselaw-query"
                    value={caselawQuery}
                    onChange={(event) => setCaselawQuery(event.target.value)}
                    placeholder="e.g. bail cancellation, arbitral award public policy"
                    className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-sm text-brand-text-primary outline-none placeholder:text-brand-text-secondary/40 focus:border-white/25"
                  />
                </div>
                <SelectField
                  label="Court"
                  value={caselawCourt}
                  options={CASELAW_COURT_OPTIONS}
                  onChange={(value) => setCaselawCourt(value as IndianCourtFilter)}
                />
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="caselaw-from"
                    className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60"
                  >
                    From
                  </label>
                  <input
                    id="caselaw-from"
                    type="date"
                    value={caselawFromDate}
                    onChange={(event) => setCaselawFromDate(event.target.value)}
                    className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-xs text-brand-text-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="caselaw-to"
                    className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/60"
                  >
                    To
                  </label>
                  <input
                    id="caselaw-to"
                    type="date"
                    value={caselawToDate}
                    onChange={(event) => setCaselawToDate(event.target.value)}
                    className="h-10 rounded-lg border border-brand-border bg-brand-bg-primary px-3 text-xs text-brand-text-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={caselawLoading || !caselawQuery.trim()}
                  className="min-h-10 rounded-lg bg-white px-4 text-[12px] font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                >
                  {caselawLoading ? 'Searching…' : 'Find cases'}
                </button>
              </div>
              {caselawMessage && (
                <p
                  role="status"
                  className="rounded-lg border border-brand-border bg-brand-bg-dark/80 px-3 py-2 text-[11px] leading-5 text-brand-text-secondary"
                >
                  {caselawMessage}
                </p>
              )}
              {caselawResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/60">
                    {caselawResults.length} live results ·{' '}
                    {caselawResults[0]?.verification === 'public_web_discovery'
                      ? 'public-web discovery · unverified'
                      : 'provider metadata'}
                  </p>
                  {caselawResults.map((result) => (
                    <CaselawCard key={result.docid || result.url} result={result} />
                  ))}
                </div>
              )}
            </div>
          </PatternPanel>
        </form>

        <form onSubmit={handleSubmit}>
          <PatternPanel pattern="dots" className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary">Search</span>
                <div className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/40"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="CNR, party name, case type, court service..."
                    className="h-11 w-full rounded-lg border border-brand-border bg-brand-bg-primary pl-10 pr-4 text-sm text-brand-text-primary outline-none transition-all placeholder:text-brand-text-secondary/40 focus:border-white/25 focus:ring-1 focus:ring-white/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                <SelectField
                  label="Court Level"
                  value={courtLevel}
                  options={COURT_LEVEL_OPTIONS}
                  onChange={(v) => setCourtLevel(v as CourtLevel | '')}
                />
                <SelectField
                  label="Data Type"
                  value={dataType}
                  options={DATA_TYPE_OPTIONS}
                  onChange={(v) => setDataType(v as CourtDataType | '')}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-lg bg-white px-5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
                >
                  {loading ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="animate-spin"
                    >
                      <path d="M21 12a9 9 0 11-6.22-8.56" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
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
            {(source || courtLevel || dataType || query.trim()) && (
              <p className="mt-3 text-[10px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/50">
                Active filters · {activeFilterLabel}
              </p>
            )}
          </PatternPanel>
        </form>

        {warnings.length > 0 && (
          <div className="rounded-xl border border-brand-border bg-brand-bg-secondary px-5 py-4 text-xs leading-5 text-brand-text-secondary/80 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 16v-4m0-4h.01" />
              </svg>
              Compliance Notes
            </div>
            {warnings.map((w) => (
              <p key={w} className="mt-1">
                {w}
              </p>
            ))}
          </div>
        )}

        {loading && records.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-brand-border bg-brand-bg-secondary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mb-4 text-brand-text-secondary animate-spin"
            >
              <path d="M21 12a9 9 0 11-6.22-8.56" />
              <path d="M21 3v6h-6" />
            </svg>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary/50">
              Loading official source catalog
            </span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-brand-border bg-brand-bg-secondary p-6 text-center animate-fadeIn">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/60 mb-2">
              Lookup failed
            </p>
            <p className="text-sm font-semibold text-brand-text-primary">{error}</p>
            {activeFilterLabel !== 'none' && (
              <p className="mt-2 text-[11px] text-brand-text-secondary/70">
                Try clearing one filter, or use Reset to reload the full directory.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => runSearch(params)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-white/90"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-border px-4 text-[11px] font-semibold text-brand-text-secondary transition-colors hover:border-white/20 hover:text-brand-text-primary"
              >
                Clear Filters
              </button>
            </div>
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
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-brand-border bg-brand-bg-secondary text-center px-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="mb-4 text-brand-text-secondary/15"
            >
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01" />
            </svg>
            <p className="text-sm font-semibold text-brand-text-primary/80">No official sources matched those filters.</p>
            <p className="mt-2 max-w-md text-xs leading-5 text-brand-text-secondary/60">
              {activeFilterLabel !== 'none'
                ? `Active filters: ${activeFilterLabel}. Clear one or more filters to view the full official-source directory.`
                : 'Clear one or more filters to view the full official-source directory.'}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-border px-4 text-[11px] font-semibold text-brand-text-secondary/70 transition-all hover:border-white/25 hover:text-brand-text-primary"
            >
              Clear Filters
            </button>
          </div>
        )}

        {records.length > 0 && (
          <p className="text-center text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/30 pt-4 pb-8">
            {aggCount > 0 && 'NJDG aggregate stats are dashboard references, not per-case records. '}
            All source data belongs to the respective official courts and portals.
          </p>
        )}
      </div>
    </div>
  );
};

export default CourtSourcesScreen;
