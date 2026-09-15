const COURT_LEVELS = [
  "supreme_court",
  "high_court",
  "district",
  "aggregate"
];
const DATA_TYPES = [
  "case_status",
  "cause_list",
  "order",
  "judgment",
  "aggregate_stat",
  "source_reference"
];
const SOURCE_IDS = [
  "sci",
  "ecourts_district",
  "ecourts_high_court",
  "judgments_ecourts",
  "njdg",
  "api_setu"
];
const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 25;
const MAX_QUERY_LENGTH = 500;
const ALLOWED_COURT_DATA_FILTERS = {
  courtLevel: COURT_LEVELS,
  dataType: DATA_TYPES,
  source: SOURCE_IDS,
  limit: { min: MIN_LIMIT, max: MAX_LIMIT, default: DEFAULT_LIMIT }
};
const CNR_COMPACT = /^[A-Z]{4}[0-9]{12}$/i;
const CNR_LOOSE = /\b([A-Z]{4})[-\s]?([0-9]{2})[-\s]?([0-9]{6})[-\s]?([0-9]{4})\b/i;
const CASE_NUMBER_HINT = /\b(?:SLP|W\.?P\.?|CRL\.?|Crl\.?|C\.?A\.?|Civil\s+Appeal|Criminal\s+Appeal|Diary|D\.?\s*No\.?|FA|MA|OSA|RSA|WP\(C\)|W\.P\.\(C\))\b[^,]{0,40}\d{1,6}\s*(?:of|\/|-)\s*\d{2,4}/i;
class CourtDataQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = "CourtDataQueryError";
  }
}
const courtDataSources = [
  {
    id: "sci",
    name: "Supreme Court of India",
    coverage: "Supreme Court case status, judgments, daily orders, cause lists, display boards, and office reports.",
    court_levels: ["supreme_court"],
    data_types: ["case_status", "cause_list", "order", "judgment", "source_reference"],
    access: "portal_reference",
    api_status: "No public documented API found during research; use official public service pages or approved access only.",
    official_url: "https://www.sci.gov.in/",
    keywords: [
      "supreme",
      "sci",
      "slp",
      "constitutional",
      "apex",
      "diary",
      "scr",
      "escr",
      "neutral citation",
      "office report",
      "display board"
    ],
    documents: [
      {
        type: "official_service",
        title: "Case status by case number",
        official_url: "https://www.sci.gov.in/case-status-case-no/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Case status by diary number",
        official_url: "https://www.sci.gov.in/case-status-diary-no/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Judgments by case number",
        official_url: "https://www.sci.gov.in/judgements-case-no/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Daily orders by case number",
        official_url: "https://www.sci.gov.in/daily-order-case-no/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Cause lists",
        official_url: "https://www.sci.gov.in/cause-list/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Display board",
        official_url: "https://www.sci.gov.in/display-board/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "eSCR / judgments search",
        official_url: "https://www.sci.gov.in/judgements/",
        retrieval_mode: "portal_reference"
      }
    ]
  },
  {
    id: "ecourts_district",
    name: "eCourts District Court Services",
    coverage: "District and taluka court CNR search, case status, court orders, cause lists, caveats, process details, and court locations.",
    court_levels: ["district"],
    data_types: ["case_status", "cause_list", "order", "source_reference"],
    access: "portal_reference",
    api_status: "Public portal available; no stable public documented API found during research.",
    official_url: "https://services.ecourts.gov.in/ecourtindia_v6/",
    keywords: [
      "district",
      "taluka",
      "cnr",
      "ecourts",
      "caveat",
      "process",
      "sessions",
      "magistrate",
      "jmfc"
    ],
    documents: [
      {
        type: "official_service",
        title: "District Court Services portal",
        official_url: "https://services.ecourts.gov.in/ecourtindia_v6/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "CNR / case status search",
        official_url: "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Court orders search",
        official_url: "https://services.ecourts.gov.in/ecourtindia_v6/?p=courtorder/index",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "Cause list",
        official_url: "https://services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index",
        retrieval_mode: "portal_reference"
      }
    ]
  },
  {
    id: "ecourts_high_court",
    name: "eCourts High Court Services",
    coverage: "High Court case status, cause lists, orders, and judgment references through official eCourts services.",
    court_levels: ["high_court"],
    data_types: ["case_status", "cause_list", "order", "judgment", "source_reference"],
    access: "portal_reference",
    api_status: "Public portal available; no stable public documented API found during research.",
    official_url: "https://hcservices.ecourts.gov.in/hcservices/",
    keywords: [
      "high court",
      "hc",
      "hcservices",
      "writ",
      "wp",
      "crl",
      "appellate",
      "bench"
    ],
    documents: [
      {
        type: "official_service",
        title: "High Court Services portal",
        official_url: "https://hcservices.ecourts.gov.in/hcservices/",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "High Court case status",
        official_url: "https://hcservices.ecourts.gov.in/hcservices/index.php?p=casestatus/index",
        retrieval_mode: "portal_reference"
      },
      {
        type: "official_service",
        title: "High Court cause list",
        official_url: "https://hcservices.ecourts.gov.in/hcservices/index.php?p=cause_list/index",
        retrieval_mode: "portal_reference"
      }
    ]
  },
  {
    id: "judgments_ecourts",
    name: "eCourts Judgments and Orders",
    coverage: "Official judgments and orders search entry point for Supreme Court, High Courts, and related judgment services.",
    court_levels: ["supreme_court", "high_court"],
    data_types: ["judgment", "order", "source_reference"],
    access: "portal_reference",
    api_status: "Public search portal available; no public documented API found during research.",
    official_url: "https://judgments.ecourts.gov.in/",
    keywords: [
      "judgment",
      "judgement",
      "order",
      "reported",
      "neutral citation",
      "download",
      "pdf"
    ],
    documents: [
      {
        type: "official_service",
        title: "Judgments and Orders portal",
        official_url: "https://judgments.ecourts.gov.in/",
        retrieval_mode: "portal_reference"
      }
    ]
  },
  {
    id: "njdg",
    name: "National Judicial Data Grid",
    coverage: "Aggregate pendency, disposal, institution, and listing statistics for District Courts and High Courts.",
    court_levels: ["aggregate"],
    data_types: ["aggregate_stat", "source_reference"],
    access: "aggregate_stats",
    api_status: "Public dashboard source for aggregate analytics, not a per-case lookup API.",
    official_url: "https://njdg.ecourts.gov.in/",
    keywords: [
      "njdg",
      "pendency",
      "disposal",
      "statistics",
      "dashboard",
      "institution",
      "backlog",
      "aggregate"
    ],
    documents: [
      {
        type: "official_dashboard",
        title: "NJDG District Courts dashboard",
        official_url: "https://njdg.ecourts.gov.in/njdg_v3/",
        retrieval_mode: "aggregate_stats"
      },
      {
        type: "official_dashboard",
        title: "NJDG High Courts dashboard",
        official_url: "https://njdg.ecourts.gov.in/hcnjdg_v2/",
        retrieval_mode: "aggregate_stats"
      }
    ]
  },
  {
    id: "api_setu",
    name: "API Setu",
    coverage: "Government API onboarding route for any future approved court-data APIs.",
    court_levels: ["supreme_court", "high_court", "district", "aggregate"],
    data_types: [
      "case_status",
      "cause_list",
      "order",
      "judgment",
      "aggregate_stat",
      "source_reference"
    ],
    access: "official_api",
    api_status: "Correct formal API channel, but no open eCourts/court API listing was found in the public directory during research.",
    official_url: "https://apisetu.gov.in/",
    keywords: ["api", "setu", "onboarding", "credential", "partner", "integration"],
    documents: [
      {
        type: "official_api_platform",
        title: "API Setu platform",
        official_url: "https://apisetu.gov.in/",
        retrieval_mode: "official_api"
      },
      {
        type: "official_api_platform",
        title: "API Setu partner onboarding",
        official_url: "https://partners.apisetu.gov.in/",
        retrieval_mode: "official_api"
      }
    ]
  }
];
function firstValue(value) {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
function parseEnum(value, allowed, field) {
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  if (allowed.includes(trimmed)) return trimmed;
  throw new CourtDataQueryError(
    `Invalid ${field}: ${trimmed}. Allowed values: ${allowed.join(", ")}`
  );
}
function parseLimit(raw) {
  const text = firstValue(raw).trim();
  if (!text) return DEFAULT_LIMIT;
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new CourtDataQueryError(
      `Invalid limit: ${text}. Expected an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.`
    );
  }
  return Math.min(Math.max(Math.trunc(n), MIN_LIMIT), MAX_LIMIT);
}
function parseCourtDataQuery(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CourtDataQueryError("Query payload must be an object.");
  }
  const q = firstValue(raw.q).trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
  const courtLevel = parseEnum(firstValue(raw.courtLevel), COURT_LEVELS, "courtLevel");
  const dataType = parseEnum(firstValue(raw.dataType), DATA_TYPES, "dataType");
  const source = parseEnum(firstValue(raw.source), SOURCE_IDS, "source");
  const limit = parseLimit(raw.limit);
  return { q, courtLevel, dataType, source, limit };
}
function extractCnr(text) {
  if (!text) return null;
  const compact = text.replace(/[\s-]/g, "");
  if (compact.length === 16 && CNR_COMPACT.test(compact)) {
    return compact.toUpperCase();
  }
  const loose = text.match(CNR_LOOSE);
  if (loose) {
    return `${loose[1]}${loose[2]}${loose[3]}${loose[4]}`.toUpperCase();
  }
  return null;
}
function extractCaseNumber(text) {
  if (!text) return null;
  const match = text.match(CASE_NUMBER_HINT);
  if (match) return match[0].replace(/\s+/g, " ").trim().slice(0, 80);
  if (extractCnr(text)) return null;
  const generic = text.match(/\b\d{1,6}\s*(?:of|\/)\s*\d{2,4}\b/i);
  return generic ? generic[0].replace(/\s+/g, " ").trim() : null;
}
function detectQueryShape(q) {
  if (!q.trim()) return "empty";
  if (extractCnr(q)) return "cnr";
  if (extractCaseNumber(q) || CASE_NUMBER_HINT.test(q)) return "case_number";
  return "party_or_text";
}
function sourceMatchesQuery(source, query) {
  if (query.source && source.id !== query.source) return false;
  if (query.courtLevel && !source.court_levels.includes(query.courtLevel)) return false;
  if (query.dataType && !source.data_types.includes(query.dataType)) return false;
  return true;
}
function primaryCourtLevel(source, query) {
  if (query.courtLevel && source.court_levels.includes(query.courtLevel)) {
    return query.courtLevel;
  }
  return source.court_levels[0];
}
function scoreSourceRelevance(source, query) {
  let score = 0;
  const q = query.q.trim().toLowerCase();
  const shape = detectQueryShape(query.q);
  if (shape === "cnr") {
    if (source.id === "ecourts_district") score += 40;
    if (source.id === "ecourts_high_court") score += 20;
    if (source.data_types.includes("case_status")) score += 8;
  } else if (shape === "case_number") {
    if (source.id === "sci") score += 25;
    if (source.id === "ecourts_high_court") score += 18;
    if (source.id === "judgments_ecourts") score += 12;
    if (source.id === "ecourts_district") score += 10;
  }
  if (query.dataType && source.data_types.includes(query.dataType)) {
    score += 15;
  }
  if (!q) {
    const order = {
      sci: 6,
      ecourts_district: 5,
      ecourts_high_court: 4,
      judgments_ecourts: 3,
      njdg: 2,
      api_setu: 1
    };
    return score + order[source.id];
  }
  const haystack = [
    source.id,
    source.name,
    source.coverage,
    ...source.keywords ?? [],
    ...source.documents.map((d) => d.title)
  ].join(" ").toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/i).map((t) => t.trim()).filter((t) => t.length >= 2);
  for (const token of tokens) {
    if (haystack.includes(token)) score += 6;
    if (source.id.replace(/_/g, "").includes(token.replace(/_/g, ""))) score += 4;
    if ((source.keywords ?? []).some((k) => k.toLowerCase().includes(token))) score += 3;
  }
  if (haystack.includes(q)) score += 10;
  return score;
}
function prioritizeDocuments(documents, query) {
  if (documents.length <= 1) return documents.slice();
  const shape = detectQueryShape(query.q);
  const dataType = query.dataType;
  const rank = (doc) => {
    let r = 0;
    const title = doc.title.toLowerCase();
    if (dataType === "case_status" && /case status|cnr|diary/.test(title)) r += 20;
    if (dataType === "judgment" && /judgment|judgement|escr/.test(title)) r += 20;
    if (dataType === "order" && /order|court order|daily order/.test(title)) r += 20;
    if (dataType === "cause_list" && /cause list/.test(title)) r += 20;
    if (dataType === "aggregate_stat" && /dashboard|njdg/.test(title)) r += 20;
    if (shape === "cnr" && /cnr|case status/.test(title)) r += 15;
    if (shape === "case_number" && /case number|case status|judgment|diary/.test(title)) r += 12;
    if (/portal$|platform$/.test(title)) r -= 2;
    return r;
  };
  return documents.map((doc, index) => ({ doc, index, r: rank(doc) })).sort((a, b) => b.r - a.r || a.index - b.index).map((row) => row.doc);
}
function recordSummary(source, query, shape, cnr, caseNumber) {
  const base = `${source.coverage} ${source.api_status}`;
  const hints = [];
  if (cnr) {
    hints.push(
      `Detected CNR ${cnr}. Use the official CNR / case-status search on this source (human portal workflow; no automated scrape).`
    );
  } else if (caseNumber) {
    hints.push(
      `Detected case reference "${caseNumber}". Prefer the official case-status or judgment search pages listed below.`
    );
  } else if (shape === "party_or_text" && query.q) {
    const hint = query.q.length > 160 ? `${query.q.slice(0, 157)}\u2026` : query.q;
    hints.push(`Use this official source as the starting point for: ${hint}.`);
  }
  if (query.dataType && query.dataType !== "source_reference") {
    hints.push(`Filtered for data type: ${query.dataType}.`);
  }
  return hints.length ? `${base} ${hints.join(" ")}` : base;
}
function sourceToRecord(source, query, retrievedAt) {
  const shape = detectQueryShape(query.q);
  const cnr = extractCnr(query.q);
  const caseNumber = cnr ? null : extractCaseNumber(query.q);
  const stampCnr = cnr && (source.id === "ecourts_district" || source.id === "ecourts_high_court") ? cnr : null;
  const stampCase = caseNumber && (source.id === "sci" || source.id === "ecourts_district" || source.id === "ecourts_high_court" || source.id === "judgments_ecourts") ? caseNumber : null;
  const dataType = query.dataType || (shape === "cnr" || shape === "case_number" ? "case_status" : "source_reference");
  return {
    id: `${source.id}-source-reference`,
    source: source.id,
    court_level: primaryCourtLevel(source, query),
    court: source.name,
    data_type: dataType,
    title: source.name,
    summary: recordSummary(source, query, shape, cnr, caseNumber),
    case_number: stampCase,
    cnr: stampCnr,
    party_names: [],
    status: null,
    dates: {},
    documents: prioritizeDocuments(source.documents, query),
    provenance: {
      official_source_url: source.official_url,
      retrieved_at: retrievedAt,
      access_basis: source.access === "official_api" ? "formal_api_onboarding" : "public_official_page",
      retrieval_mode: source.access
    }
  };
}
function describeActiveFilters(query) {
  const parts = [];
  if (query.source) parts.push(`source=${query.source}`);
  if (query.courtLevel) parts.push(`courtLevel=${query.courtLevel}`);
  if (query.dataType) parts.push(`dataType=${query.dataType}`);
  if (query.q) parts.push(`q="${query.q}"`);
  return parts.length ? parts.join(", ") : "none";
}
function buildWarnings(query, records) {
  const warnings = [
    "This official-only gateway excludes paid legal databases and private case-law providers."
  ];
  if (records.length === 0) {
    warnings.push(
      `No official sources matched the requested filters (${describeActiveFilters(query)}). Broaden court level, data type, or source.`
    );
    return warnings;
  }
  if (records.some((record) => record.provenance.retrieval_mode === "portal_reference")) {
    warnings.push(
      "Portal-only sources are returned as official references unless documented API access is configured; do not bypass captchas, login flows, anti-bot controls, or hidden endpoints."
    );
  }
  if (records.some((record) => record.provenance.retrieval_mode === "aggregate_stats")) {
    warnings.push(
      "NJDG records are aggregate statistical references, not per-case status records."
    );
  }
  if (records.some((record) => record.provenance.retrieval_mode === "official_api")) {
    warnings.push(
      "API Setu is an onboarding channel; approved credentials are required before live court APIs can be called."
    );
  }
  const shape = detectQueryShape(query.q);
  if (shape === "cnr") {
    warnings.push(
      "CNR was detected in the query. LexForge does not auto-query eCourts; open the linked official CNR / case-status page to complete the lookup."
    );
  }
  return warnings;
}
function getCourtDataSourceById(id) {
  return courtDataSources.find((source) => source.id === id);
}
function buildCourtDataResponse(raw, now = /* @__PURE__ */ new Date()) {
  const query = parseCourtDataQuery(raw ?? {});
  const matched = courtDataSources.filter((source) => sourceMatchesQuery(source, query));
  const ranked = matched.map((source, index) => ({
    source,
    index,
    score: scoreSourceRelevance(source, query)
  })).sort((a, b) => b.score - a.score || a.index - b.index).map((row) => row.source);
  const sources = ranked.slice(0, query.limit);
  const retrievedAt = Number.isNaN(now.getTime()) ? (/* @__PURE__ */ new Date()).toISOString() : now.toISOString();
  const records = sources.map((source) => sourceToRecord(source, query, retrievedAt));
  return {
    query,
    records,
    sources,
    warnings: buildWarnings(query, records)
  };
}
export {
  ALLOWED_COURT_DATA_FILTERS,
  COURT_LEVELS,
  CourtDataQueryError,
  DATA_TYPES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  MIN_LIMIT,
  SOURCE_IDS,
  buildCourtDataResponse,
  courtDataSources,
  describeActiveFilters,
  detectQueryShape,
  extractCaseNumber,
  extractCnr,
  getCourtDataSourceById,
  parseCourtDataQuery,
  prioritizeDocuments,
  scoreSourceRelevance
};
