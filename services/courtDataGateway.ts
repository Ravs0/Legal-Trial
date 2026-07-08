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

export type CourtDataAccessMode =
  | 'official_api'
  | 'public_artifact'
  | 'portal_reference'
  | 'aggregate_stats';

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

export interface CourtDataQuery {
  q: string;
  courtLevel?: CourtLevel;
  dataType?: CourtDataType;
  source?: CourtDataSourceId;
  limit: number;
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
  query: CourtDataQuery;
  records: CourtDataRecord[];
  sources: CourtDataSource[];
  warnings: string[];
}

const COURT_LEVELS: CourtLevel[] = ['supreme_court', 'high_court', 'district', 'aggregate'];
const DATA_TYPES: CourtDataType[] = ['case_status', 'cause_list', 'order', 'judgment', 'aggregate_stat', 'source_reference'];
const SOURCE_IDS: CourtDataSourceId[] = [
  'sci',
  'ecourts_district',
  'ecourts_high_court',
  'judgments_ecourts',
  'njdg',
  'api_setu',
];

export class CourtDataQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourtDataQueryError';
  }
}

export const courtDataSources: CourtDataSource[] = [
  {
    id: 'sci',
    name: 'Supreme Court of India',
    coverage: 'Supreme Court case status, judgments, daily orders, cause lists, display boards, and office reports.',
    court_levels: ['supreme_court'],
    data_types: ['case_status', 'cause_list', 'order', 'judgment', 'source_reference'],
    access: 'portal_reference',
    api_status: 'No public documented API found during research; use official public service pages or approved access only.',
    official_url: 'https://www.sci.gov.in/',
    documents: [
      {
        type: 'official_service',
        title: 'Case status by case number',
        official_url: 'https://www.sci.gov.in/case-status-case-no/',
        retrieval_mode: 'portal_reference',
      },
      {
        type: 'official_service',
        title: 'Judgments by case number',
        official_url: 'https://www.sci.gov.in/judgements-case-no/',
        retrieval_mode: 'portal_reference',
      },
      {
        type: 'official_service',
        title: 'Daily orders by case number',
        official_url: 'https://www.sci.gov.in/daily-order-case-no/',
        retrieval_mode: 'portal_reference',
      },
      {
        type: 'official_service',
        title: 'Cause lists',
        official_url: 'https://www.sci.gov.in/cause-list/',
        retrieval_mode: 'portal_reference',
      },
    ],
  },
  {
    id: 'ecourts_district',
    name: 'eCourts District Court Services',
    coverage: 'District and taluka court CNR search, case status, court orders, cause lists, caveats, process details, and court locations.',
    court_levels: ['district'],
    data_types: ['case_status', 'cause_list', 'order', 'source_reference'],
    access: 'portal_reference',
    api_status: 'Public portal available; no stable public documented API found during research.',
    official_url: 'https://services.ecourts.gov.in/ecourtindia_v6/',
    documents: [
      {
        type: 'official_service',
        title: 'District Court Services portal',
        official_url: 'https://services.ecourts.gov.in/ecourtindia_v6/',
        retrieval_mode: 'portal_reference',
      },
    ],
  },
  {
    id: 'ecourts_high_court',
    name: 'eCourts High Court Services',
    coverage: 'High Court case status, cause lists, orders, and judgment references through official eCourts services.',
    court_levels: ['high_court'],
    data_types: ['case_status', 'cause_list', 'order', 'judgment', 'source_reference'],
    access: 'portal_reference',
    api_status: 'Public portal available; no stable public documented API found during research.',
    official_url: 'https://hcservices.ecourts.gov.in/hcservices/',
    documents: [
      {
        type: 'official_service',
        title: 'High Court Services portal',
        official_url: 'https://hcservices.ecourts.gov.in/hcservices/',
        retrieval_mode: 'portal_reference',
      },
    ],
  },
  {
    id: 'judgments_ecourts',
    name: 'eCourts Judgments and Orders',
    coverage: 'Official judgments and orders search entry point for Supreme Court, High Courts, and related judgment services.',
    court_levels: ['supreme_court', 'high_court'],
    data_types: ['judgment', 'order', 'source_reference'],
    access: 'portal_reference',
    api_status: 'Public search portal available; no public documented API found during research.',
    official_url: 'https://judgments.ecourts.gov.in/',
    documents: [
      {
        type: 'official_service',
        title: 'Judgments and Orders portal',
        official_url: 'https://judgments.ecourts.gov.in/',
        retrieval_mode: 'portal_reference',
      },
    ],
  },
  {
    id: 'njdg',
    name: 'National Judicial Data Grid',
    coverage: 'Aggregate pendency, disposal, institution, and listing statistics for District Courts and High Courts.',
    court_levels: ['aggregate'],
    data_types: ['aggregate_stat', 'source_reference'],
    access: 'aggregate_stats',
    api_status: 'Public dashboard source for aggregate analytics, not a per-case lookup API.',
    official_url: 'https://njdg.ecourts.gov.in/',
    documents: [
      {
        type: 'official_dashboard',
        title: 'NJDG District Courts dashboard',
        official_url: 'https://njdg.ecourts.gov.in/njdg_v3/',
        retrieval_mode: 'aggregate_stats',
      },
      {
        type: 'official_dashboard',
        title: 'NJDG High Courts dashboard',
        official_url: 'https://njdg.ecourts.gov.in/hcnjdg_v2/',
        retrieval_mode: 'aggregate_stats',
      },
    ],
  },
  {
    id: 'api_setu',
    name: 'API Setu',
    coverage: 'Government API onboarding route for any future approved court-data APIs.',
    court_levels: ['supreme_court', 'high_court', 'district', 'aggregate'],
    data_types: ['case_status', 'cause_list', 'order', 'judgment', 'aggregate_stat', 'source_reference'],
    access: 'official_api',
    api_status: 'Correct formal API channel, but no open eCourts/court API listing was found in the public directory during research.',
    official_url: 'https://apisetu.gov.in/',
    documents: [
      {
        type: 'official_api_platform',
        title: 'API Setu platform',
        official_url: 'https://apisetu.gov.in/',
        retrieval_mode: 'official_api',
      },
      {
        type: 'official_api_platform',
        title: 'API Setu partner onboarding',
        official_url: 'https://partners.apisetu.gov.in/',
        retrieval_mode: 'official_api',
      },
    ],
  },
];

function firstValue(value: unknown): string {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], field: string): T | undefined {
  if (!value) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new CourtDataQueryError(`Invalid ${field}: ${value}. Allowed values: ${allowed.join(', ')}`);
}

export function parseCourtDataQuery(raw: Record<string, unknown>): CourtDataQuery {
  const q = firstValue(raw.q).trim().slice(0, 500);
  const courtLevel = parseEnum(firstValue(raw.courtLevel), COURT_LEVELS, 'courtLevel');
  const dataType = parseEnum(firstValue(raw.dataType), DATA_TYPES, 'dataType');
  const source = parseEnum(firstValue(raw.source), SOURCE_IDS, 'source');
  const requestedLimit = Number(firstValue(raw.limit)) || 10;
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 25);

  return { q, courtLevel, dataType, source, limit };
}

function sourceMatchesQuery(source: CourtDataSource, query: CourtDataQuery): boolean {
  if (query.source && source.id !== query.source) return false;
  if (query.courtLevel && !source.court_levels.includes(query.courtLevel)) return false;
  if (query.dataType && !source.data_types.includes(query.dataType)) return false;
  return true;
}

function primaryCourtLevel(source: CourtDataSource, query: CourtDataQuery): CourtLevel {
  if (query.courtLevel && source.court_levels.includes(query.courtLevel)) return query.courtLevel;
  return source.court_levels[0];
}

function recordSummary(source: CourtDataSource, query: CourtDataQuery): string {
  const base = `${source.coverage} ${source.api_status}`;
  if (!query.q) return base;
  return `${base} Use this official source as the starting point for: ${query.q}.`;
}

function sourceToRecord(source: CourtDataSource, query: CourtDataQuery, retrievedAt: string): CourtDataRecord {
  return {
    id: `${source.id}-source-reference`,
    source: source.id,
    court_level: primaryCourtLevel(source, query),
    court: source.name,
    data_type: query.dataType || 'source_reference',
    title: source.name,
    summary: recordSummary(source, query),
    case_number: null,
    cnr: null,
    party_names: [],
    status: null,
    dates: {},
    documents: source.documents,
    provenance: {
      official_source_url: source.official_url,
      retrieved_at: retrievedAt,
      access_basis: source.access === 'official_api' ? 'formal_api_onboarding' : 'public_official_page',
      retrieval_mode: source.access,
    },
  };
}

function buildWarnings(records: CourtDataRecord[]): string[] {
  const warnings = [
    'This official-only gateway excludes paid legal databases and private case-law providers.',
  ];

  if (records.some((record) => record.provenance.retrieval_mode === 'portal_reference')) {
    warnings.push(
      'Portal-only sources are returned as official references unless documented API access is configured; do not bypass captchas, login flows, anti-bot controls, or hidden endpoints.',
    );
  }

  if (records.some((record) => record.provenance.retrieval_mode === 'aggregate_stats')) {
    warnings.push('NJDG records are aggregate statistical references, not per-case status records.');
  }

  return warnings;
}

export function buildCourtDataResponse(raw: Record<string, unknown>, now: Date = new Date()): CourtDataResponse {
  const query = parseCourtDataQuery(raw);
  const sources = courtDataSources.filter((source) => sourceMatchesQuery(source, query)).slice(0, query.limit);
  const retrievedAt = now.toISOString();
  const records = sources.map((source) => sourceToRecord(source, query, retrievedAt));

  return {
    query,
    records,
    sources,
    warnings: buildWarnings(records),
  };
}
