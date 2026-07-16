export type CourtDataSourceId =
  | 'sci'
  | 'ecourts_district'
  | 'ecourts_high_court'
  | 'judgments_ecourts'
  | 'njdg'
  | 'api_setu';

export type CourtLevel = 'supreme_court' | 'high_court' | 'district' | 'aggregate';

export type CourtDataType =
  | 'case_status'
  | 'cause_list'
  | 'order'
  | 'judgment'
  | 'aggregate_stat'
  | 'source_reference';

export type CourtDataAccessMode = 'official_api' | 'public_artifact' | 'portal_reference' | 'aggregate_stats';

export interface CourtSourceSearchParams {
  q?: string;
  source?: CourtDataSourceId | '';
  courtLevel?: CourtLevel | '';
  dataType?: CourtDataType | '';
  limit?: number;
  /** Optional abort signal so callers can cancel stale searches. */
  signal?: AbortSignal;
}

export interface CourtDataDocument {
  type: string;
  title: string;
  official_url: string;
  retrieval_mode: CourtDataAccessMode;
}

export interface CourtDataSource {
  id: CourtDataSourceId;
  name: string;
  coverage: string;
  court_levels: CourtLevel[];
  data_types: CourtDataType[];
  access: CourtDataAccessMode;
  api_status: string;
  official_url: string;
  documents: CourtDataDocument[];
}

export interface CourtDataRecord {
  id: string;
  source: CourtDataSourceId;
  court_level: CourtLevel;
  court: string;
  data_type: CourtDataType;
  title: string;
  summary: string;
  case_number: string | null;
  cnr: string | null;
  party_names: string[];
  status: string | null;
  dates: Record<string, string>;
  documents: CourtDataDocument[];
  provenance: {
    official_source_url: string;
    retrieved_at: string;
    access_basis: string;
    retrieval_mode: CourtDataAccessMode;
  };
}

export interface CourtDataResponse {
  query: {
    q: string;
    source?: CourtDataSourceId;
    courtLevel?: CourtLevel;
    dataType?: CourtDataType;
    limit: number;
  };
  records: CourtDataRecord[];
  sources: CourtDataSource[];
  warnings: string[];
}

const SOURCE_IDS: readonly CourtDataSourceId[] = [
  'sci',
  'ecourts_district',
  'ecourts_high_court',
  'judgments_ecourts',
  'njdg',
  'api_setu',
] as const;

const COURT_LEVELS: readonly CourtLevel[] = [
  'supreme_court',
  'high_court',
  'district',
  'aggregate',
] as const;

const DATA_TYPES: readonly CourtDataType[] = [
  'case_status',
  'cause_list',
  'order',
  'judgment',
  'aggregate_stat',
  'source_reference',
] as const;

const MIN_LIMIT = 1;
const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 500;

export class CourtSourcesServiceError extends Error {
  readonly code: 'validation' | 'network' | 'http' | 'aborted' | 'invalid_response';

  constructor(
    message: string,
    code: CourtSourcesServiceError['code'] = 'http',
  ) {
    super(message);
    this.name = 'CourtSourcesServiceError';
    this.code = code;
  }
}

export function isCourtSourcesAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof CourtSourcesServiceError && err.code === 'aborted') return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return err instanceof Error && (err.name === 'AbortError' || /aborted|abort(ed)?/i.test(err.message));
}

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new CourtSourcesServiceError(
    `Invalid ${field} filter. Allowed: ${allowed.join(', ')}.`,
    'validation',
  );
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new CourtSourcesServiceError(
      `Invalid limit. Expected an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.`,
      'validation',
    );
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(n)));
}

/** Validate and normalize search params before the network call. */
export function normalizeCourtSourceSearchParams(
  params: CourtSourceSearchParams,
): Omit<CourtSourceSearchParams, 'signal'> & { limit: number } {
  const q = asTrimmedString(params.q, MAX_QUERY_LENGTH);
  if (typeof params.q === 'string' && params.q.trim().length > MAX_QUERY_LENGTH) {
    throw new CourtSourcesServiceError(
      `Search query is too long (max ${MAX_QUERY_LENGTH} characters).`,
      'validation',
    );
  }

  const source = parseOptionalEnum(params.source, SOURCE_IDS, 'source');
  const courtLevel = parseOptionalEnum(params.courtLevel, COURT_LEVELS, 'court level');
  const dataType = parseOptionalEnum(params.dataType, DATA_TYPES, 'data type');
  const limit = parseLimit(params.limit);

  return {
    ...(q ? { q } : {}),
    ...(source ? { source } : {}),
    ...(courtLevel ? { courtLevel } : {}),
    ...(dataType ? { dataType } : {}),
    limit,
  };
}

function compactParams(params: ReturnType<typeof normalizeCourtSourceSearchParams>): Record<string, string | number> {
  const clean: Record<string, string | number> = { limit: params.limit };
  if (params.q) clean.q = params.q;
  if (params.source) clean.source = params.source;
  if (params.courtLevel) clean.courtLevel = params.courtLevel;
  if (params.dataType) clean.dataType = params.dataType;
  return clean;
}

/** Human-readable active filters for empty/error UI. */
export function describeCourtSourceFilters(params: CourtSourceSearchParams): string {
  const parts: string[] = [];
  if (params.source) parts.push(`source=${params.source}`);
  if (params.courtLevel) parts.push(`court level=${params.courtLevel}`);
  if (params.dataType) parts.push(`data type=${params.dataType}`);
  if (params.q?.trim()) parts.push(`query="${params.q.trim().slice(0, 80)}"`);
  return parts.length ? parts.join(', ') : 'none';
}

function safeRecords(raw: unknown): CourtDataRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is CourtDataRecord => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Partial<CourtDataRecord>;
    return typeof r.id === 'string' && typeof r.title === 'string' && !!r.provenance;
  });
}

function normalizeResponse(data: unknown, fallbackLimit: number): CourtDataResponse {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const queryRaw = body.query && typeof body.query === 'object'
    ? (body.query as Record<string, unknown>)
    : {};

  return {
    query: {
      q: typeof queryRaw.q === 'string' ? queryRaw.q : '',
      source: typeof queryRaw.source === 'string' ? (queryRaw.source as CourtDataSourceId) : undefined,
      courtLevel: typeof queryRaw.courtLevel === 'string' ? (queryRaw.courtLevel as CourtLevel) : undefined,
      dataType: typeof queryRaw.dataType === 'string' ? (queryRaw.dataType as CourtDataType) : undefined,
      limit: typeof queryRaw.limit === 'number' && Number.isFinite(queryRaw.limit)
        ? queryRaw.limit
        : fallbackLimit,
    },
    records: safeRecords(body.records),
    sources: Array.isArray(body.sources) ? (body.sources as CourtDataSource[]) : [],
    warnings: Array.isArray(body.warnings)
      ? body.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      : [],
  };
}

export async function searchOfficialCourtSources(
  params: CourtSourceSearchParams,
): Promise<CourtDataResponse> {
  if (params.signal?.aborted) {
    throw new CourtSourcesServiceError('Search cancelled.', 'aborted');
  }

  let normalized: ReturnType<typeof normalizeCourtSourceSearchParams>;
  try {
    normalized = normalizeCourtSourceSearchParams(params);
  } catch (err) {
    if (err instanceof CourtSourcesServiceError) throw err;
    throw new CourtSourcesServiceError(
      err instanceof Error ? err.message : 'Invalid court source filters.',
      'validation',
    );
  }

  let res: Response;
  try {
    res = await fetch('/api/court-data/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(compactParams(normalized)),
      signal: params.signal,
    });
  } catch (err) {
    if (isCourtSourcesAbortError(err) || params.signal?.aborted) {
      throw new CourtSourcesServiceError('Search cancelled.', 'aborted');
    }
    throw new CourtSourcesServiceError(
      `Network error reaching court sources: ${(err as Error).message || 'request failed'}`,
      'network',
    );
  }

  if (params.signal?.aborted) {
    throw new CourtSourcesServiceError('Search cancelled.', 'aborted');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new CourtSourcesServiceError(
        `Court sources service error (${res.status}).`,
        'http',
      );
    }
    throw new CourtSourcesServiceError(
      'Court sources service returned invalid JSON.',
      'invalid_response',
    );
  }

  if (!res.ok) {
    const body = data && typeof data === 'object' ? (data as { error?: unknown }) : null;
    const serverError = typeof body?.error === 'string' ? body.error.trim() : '';
    // Prefer server validation text (invalid enum / limit) so filter mistakes are clear.
    throw new CourtSourcesServiceError(
      serverError || `Court sources service error (${res.status}).`,
      res.status === 400 ? 'validation' : 'http',
    );
  }

  const response = normalizeResponse(data, normalized.limit);

  // Surface empty filter combos even if the API omitted the empty-match warning.
  if (
    response.records.length === 0
    && (normalized.source || normalized.courtLevel || normalized.dataType || normalized.q)
    && !response.warnings.some((w) => /no official sources matched/i.test(w))
  ) {
    response.warnings = [
      ...response.warnings,
      `No official sources matched the requested filters (${describeCourtSourceFilters(normalized)}). Broaden court level, data type, or source.`,
    ];
  }

  return response;
}
