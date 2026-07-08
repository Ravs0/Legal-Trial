import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Filter, Landmark, Loader2, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  CourtDataRecord,
  CourtDataSourceId,
  CourtDataType,
  CourtLevel,
  CourtSourceSearchParams,
  searchOfficialCourtSources,
} from '../services/courtSourcesService';

const SOURCE_OPTIONS: { value: CourtDataSourceId | ''; label: string }[] = [
  { value: '', label: 'All sources' },
  { value: 'sci', label: 'Supreme Court' },
  { value: 'ecourts_district', label: 'eCourts District' },
  { value: 'ecourts_high_court', label: 'eCourts High Court' },
  { value: 'judgments_ecourts', label: 'Judgments eCourts' },
  { value: 'njdg', label: 'NJDG' },
  { value: 'api_setu', label: 'API Setu' },
];

const COURT_LEVEL_OPTIONS: { value: CourtLevel | ''; label: string }[] = [
  { value: '', label: 'All court levels' },
  { value: 'supreme_court', label: 'Supreme Court' },
  { value: 'high_court', label: 'High Court' },
  { value: 'district', label: 'District' },
  { value: 'aggregate', label: 'Aggregate' },
];

const DATA_TYPE_OPTIONS: { value: CourtDataType | ''; label: string }[] = [
  { value: '', label: 'All data types' },
  { value: 'case_status', label: 'Case status' },
  { value: 'cause_list', label: 'Cause list' },
  { value: 'order', label: 'Order' },
  { value: 'judgment', label: 'Judgment' },
  { value: 'aggregate_stat', label: 'Aggregate stats' },
  { value: 'source_reference', label: 'Source reference' },
];

function formatToken(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SelectField: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="mb-2 block text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/70">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-lg border border-brand-border bg-brand-bg-dark px-3 text-xs text-brand-text-primary outline-none transition-colors focus:border-brand-accent"
    >
      {options.map((option) => (
        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

const AccessBadge: React.FC<{ mode: string }> = ({ mode }) => {
  const isApi = mode === 'official_api';
  const isAggregate = mode === 'aggregate_stats';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
      isApi
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
        : isAggregate
          ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
          : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
    }`}>
      <ShieldCheck size={11} /> {formatToken(mode)}
    </span>
  );
};

const SourceCard: React.FC<{ record: CourtDataRecord }> = ({ record }) => (
  <article className="rounded-lg border border-brand-border bg-brand-bg-secondary p-5 transition-colors hover:border-brand-accent/40">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <AccessBadge mode={record.provenance.retrieval_mode} />
          <span className="rounded-md border border-white/10 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">
            {formatToken(record.court_level)}
          </span>
          <span className="rounded-md border border-white/10 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">
            {formatToken(record.data_type)}
          </span>
        </div>
        <h2 className="font-serif text-lg font-semibold text-brand-text-primary">{record.title}</h2>
        <p className="mt-2 text-sm leading-6 text-brand-text-secondary">{record.summary}</p>
      </div>
      <a
        href={record.provenance.official_source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-accent/40 px-3 text-xs font-semibold text-brand-accent transition-colors hover:bg-brand-accent hover:text-brand-bg-dark"
      >
        Open Source <ExternalLink size={14} />
      </a>
    </div>

    {record.provenance.retrieval_mode === 'portal_reference' && (
      <div className="mt-4 flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-100/80">
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-300" />
        <span>Portal reference only. Use the official page directly; this screen does not bypass captcha, login, session, or anti-bot controls.</span>
      </div>
    )}

    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      {record.documents.map((document) => (
        <a
          key={`${record.id}-${document.title}`}
          href={document.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/10 bg-brand-bg-dark px-3 py-2 text-xs text-brand-text-secondary transition-colors hover:border-brand-accent/40 hover:text-brand-text-primary"
        >
          <span className="line-clamp-2">{document.title}</span>
          <ExternalLink size={13} className="shrink-0 text-brand-accent" />
        </a>
      ))}
    </div>
  </article>
);

const CourtSourcesScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<CourtDataSourceId | ''>('');
  const [courtLevel, setCourtLevel] = useState<CourtLevel | ''>('');
  const [dataType, setDataType] = useState<CourtDataType | ''>('');
  const [records, setRecords] = useState<CourtDataRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo<CourtSourceSearchParams>(() => ({
    q: query,
    source,
    courtLevel,
    dataType,
    limit: 12,
  }), [courtLevel, dataType, query, source]);

  const runSearch = async (nextParams: CourtSourceSearchParams = params) => {
    setLoading(true);
    setError(null);
    try {
      const response = await searchOfficialCourtSources(nextParams);
      setRecords(response.records);
      setWarnings(response.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Court source lookup failed.');
      setRecords([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch({ limit: 12 });
    // Load the official source directory once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    runSearch(params);
  };

  const resetFilters = () => {
    setQuery('');
    setSource('');
    setCourtLevel('');
    setDataType('');
    runSearch({ limit: 12 });
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-brand-bg-primary p-4 pb-12 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="border-b border-brand-border pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-brand-accent/25 bg-brand-accent/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-accent">
                <Landmark size={13} /> Official Indian Court Sources
              </div>
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-brand-text-primary sm:text-4xl">Court Sources</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-text-secondary">
                Search official court service entry points across Supreme Court, eCourts, judgments portals, NJDG, and API Setu. Results are source references with provenance, not scraped live case records.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-brand-border bg-brand-bg-secondary p-3 text-center">
              <div>
                <div className="text-lg font-semibold text-brand-text-primary">{records.length}</div>
                <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">Sources</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-brand-text-primary">{records.filter((record) => record.provenance.retrieval_mode === 'portal_reference').length}</div>
                <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">Portals</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-brand-text-primary">{records.filter((record) => record.provenance.retrieval_mode === 'official_api').length}</div>
                <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">API</div>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-lg border border-brand-border bg-brand-bg-secondary p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary">
            <Filter size={13} className="text-brand-accent" /> Search Controls
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/70">Query</span>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary/50" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="CNR, party name, case type, court service..."
                  className="h-11 w-full rounded-lg border border-brand-border bg-brand-bg-dark pl-9 pr-3 text-sm text-brand-text-primary outline-none transition-colors placeholder:text-brand-text-secondary/35 focus:border-brand-accent"
                />
              </div>
            </label>
            <SelectField label="Source" value={source} options={SOURCE_OPTIONS} onChange={(value) => setSource(value as CourtDataSourceId | '')} />
            <SelectField label="Court Level" value={courtLevel} options={COURT_LEVEL_OPTIONS} onChange={(value) => setCourtLevel(value as CourtLevel | '')} />
            <SelectField label="Data Type" value={dataType} options={DATA_TYPE_OPTIONS} onChange={(value) => setDataType(value as CourtDataType | '')} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-11 min-w-24 items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 text-xs font-bold uppercase tracking-[0.12em] text-brand-bg-dark transition-colors hover:bg-brand-accent/85 disabled:opacity-60"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={14} />} Search
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="h-11 rounded-lg border border-brand-border px-3 text-xs font-semibold text-brand-text-secondary transition-colors hover:border-brand-accent/50 hover:text-brand-text-primary"
              >
                Reset
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
        )}

        {warnings.length > 0 && (
          <section className="grid gap-2">
            {warnings.map((warning) => (
              <div key={warning} className="flex gap-2 rounded-lg border border-brand-accent/20 bg-brand-accent/5 p-3 text-xs leading-5 text-brand-text-secondary">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-accent" />
                <span>{warning}</span>
              </div>
            ))}
          </section>
        )}

        <section className="grid gap-4">
          {loading && records.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-brand-border bg-brand-bg-secondary text-brand-text-secondary">
              <Loader2 size={28} className="mb-4 animate-spin text-brand-accent" />
              <span className="text-[10px] font-mono uppercase tracking-[0.18em]">Loading official source catalog</span>
            </div>
          ) : records.length > 0 ? (
            records.map((record) => <SourceCard key={record.id} record={record} />)
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-brand-border bg-brand-bg-secondary text-center">
              <Landmark size={34} className="mb-4 text-brand-text-secondary/25" />
              <p className="text-sm font-semibold text-brand-text-primary">No official sources matched those filters.</p>
              <p className="mt-2 max-w-md text-xs leading-5 text-brand-text-secondary">Clear one or more filters to view the full official-source directory.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CourtSourcesScreen;
