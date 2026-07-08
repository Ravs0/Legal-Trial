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

class CourtSourcesServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourtSourcesServiceError';
  }
}

function compactParams(params: CourtSourceSearchParams): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  if (params.q?.trim()) clean.q = params.q.trim();
  if (params.source) clean.source = params.source;
  if (params.courtLevel) clean.courtLevel = params.courtLevel;
  if (params.dataType) clean.dataType = params.dataType;
  clean.limit = params.limit || 10;
  return clean;
}

export async function searchOfficialCourtSources(params: CourtSourceSearchParams): Promise<CourtDataResponse> {
  let res: Response;
  try {
    res = await fetch('/api/court-data/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(compactParams(params)),
    });
  } catch (err) {
    throw new CourtSourcesServiceError(`Network error reaching /api/court-data/search: ${(err as Error).message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CourtSourcesServiceError(data?.error || `Court sources service error (${res.status})`);
  }

  return {
    query: data.query || { q: '', limit: params.limit || 10 },
    records: Array.isArray(data.records) ? data.records : [],
    sources: Array.isArray(data.sources) ? data.sources : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}
