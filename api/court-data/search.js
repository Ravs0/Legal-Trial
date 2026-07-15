// Vercel Node.js 18+ serverless function — official Indian court data gateway
import { allowRequest, applyCors } from '../security.js';
//
// This route intentionally returns official source references and normalized
// metadata. It does not scrape captcha-protected/session-only court portals or
// paid legal databases.

const ALLOWED_ORIGINS = new Set([
    "https://trialsim.vercel.app",
    "https://trialsim.app",
    "http://localhost:5173",
    "http://localhost:3000"
]);

const COURT_LEVELS = ["supreme_court", "high_court", "district", "aggregate"];
const DATA_TYPES = ["case_status", "cause_list", "order", "judgment", "aggregate_stat", "source_reference"];
const SOURCE_IDS = ["sci", "ecourts_district", "ecourts_high_court", "judgments_ecourts", "njdg", "api_setu"];

const SOURCES = [
    {
        id: "sci",
        name: "Supreme Court of India",
        coverage: "Supreme Court case status, judgments, daily orders, cause lists, display boards, and office reports.",
        court_levels: ["supreme_court"],
        data_types: ["case_status", "cause_list", "order", "judgment", "source_reference"],
        access: "portal_reference",
        api_status: "No public documented API found during research; use official public service pages or approved access only.",
        official_url: "https://www.sci.gov.in/",
        documents: [
            { type: "official_service", title: "Case status by case number", official_url: "https://www.sci.gov.in/case-status-case-no/", retrieval_mode: "portal_reference" },
            { type: "official_service", title: "Judgments by case number", official_url: "https://www.sci.gov.in/judgements-case-no/", retrieval_mode: "portal_reference" },
            { type: "official_service", title: "Daily orders by case number", official_url: "https://www.sci.gov.in/daily-order-case-no/", retrieval_mode: "portal_reference" },
            { type: "official_service", title: "Cause lists", official_url: "https://www.sci.gov.in/cause-list/", retrieval_mode: "portal_reference" }
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
        documents: [
            { type: "official_service", title: "District Court Services portal", official_url: "https://services.ecourts.gov.in/ecourtindia_v6/", retrieval_mode: "portal_reference" }
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
        documents: [
            { type: "official_service", title: "High Court Services portal", official_url: "https://hcservices.ecourts.gov.in/hcservices/", retrieval_mode: "portal_reference" }
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
        documents: [
            { type: "official_service", title: "Judgments and Orders portal", official_url: "https://judgments.ecourts.gov.in/", retrieval_mode: "portal_reference" }
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
        documents: [
            { type: "official_dashboard", title: "NJDG District Courts dashboard", official_url: "https://njdg.ecourts.gov.in/njdg_v3/", retrieval_mode: "aggregate_stats" },
            { type: "official_dashboard", title: "NJDG High Courts dashboard", official_url: "https://njdg.ecourts.gov.in/hcnjdg_v2/", retrieval_mode: "aggregate_stats" }
        ]
    },
    {
        id: "api_setu",
        name: "API Setu",
        coverage: "Government API onboarding route for any future approved court-data APIs.",
        court_levels: ["supreme_court", "high_court", "district", "aggregate"],
        data_types: ["case_status", "cause_list", "order", "judgment", "aggregate_stat", "source_reference"],
        access: "official_api",
        api_status: "Correct formal API channel, but no open eCourts/court API listing was found in the public directory during research.",
        official_url: "https://apisetu.gov.in/",
        documents: [
            { type: "official_api_platform", title: "API Setu platform", official_url: "https://apisetu.gov.in/", retrieval_mode: "official_api" },
            { type: "official_api_platform", title: "API Setu partner onboarding", official_url: "https://partners.apisetu.gov.in/", retrieval_mode: "official_api" }
        ]
    }
];

class CourtDataQueryError extends Error {
    constructor(message) {
        super(message);
        this.name = "CourtDataQueryError";
    }
}

function getCorsHeaders(origin) {
    const isAllowed = origin && ALLOWED_ORIGINS.has(origin);
    const headerOrigin = isAllowed ? origin : "https://trialsim.app";
    return {
        "Access-Control-Allow-Origin": headerOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };
}

function firstValue(value) {
    if (Array.isArray(value)) return firstValue(value[0]);
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function parseEnum(value, allowed, field) {
    if (!value) return undefined;
    if (allowed.includes(value)) return value;
    throw new CourtDataQueryError(`Invalid ${field}: ${value}. Allowed values: ${allowed.join(", ")}`);
}

function parseCourtDataQuery(raw) {
    const q = firstValue(raw.q).trim().slice(0, 500);
    const courtLevel = parseEnum(firstValue(raw.courtLevel), COURT_LEVELS, "courtLevel");
    const dataType = parseEnum(firstValue(raw.dataType), DATA_TYPES, "dataType");
    const source = parseEnum(firstValue(raw.source), SOURCE_IDS, "source");
    const requestedLimit = Number(firstValue(raw.limit)) || 10;
    const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 25);

    return { q, courtLevel, dataType, source, limit };
}

function sourceMatchesQuery(source, query) {
    if (query.source && source.id !== query.source) return false;
    if (query.courtLevel && !source.court_levels.includes(query.courtLevel)) return false;
    if (query.dataType && !source.data_types.includes(query.dataType)) return false;
    return true;
}

function sourceToRecord(source, query, retrievedAt) {
    const baseSummary = `${source.coverage} ${source.api_status}`;
    return {
        id: `${source.id}-source-reference`,
        source: source.id,
        court_level: query.courtLevel && source.court_levels.includes(query.courtLevel) ? query.courtLevel : source.court_levels[0],
        court: source.name,
        data_type: query.dataType || "source_reference",
        title: source.name,
        summary: query.q ? `${baseSummary} Use this official source as the starting point for: ${query.q}.` : baseSummary,
        case_number: null,
        cnr: null,
        party_names: [],
        status: null,
        dates: {},
        documents: source.documents,
        provenance: {
            official_source_url: source.official_url,
            retrieved_at: retrievedAt,
            access_basis: source.access === "official_api" ? "formal_api_onboarding" : "public_official_page",
            retrieval_mode: source.access
        }
    };
}

function buildWarnings(records) {
    const warnings = ["This official-only gateway excludes paid legal databases and private case-law providers."];
    if (records.some((record) => record.provenance.retrieval_mode === "portal_reference")) {
        warnings.push("Portal-only sources are returned as official references unless documented API access is configured; do not bypass captchas, login flows, anti-bot controls, or hidden endpoints.");
    }
    if (records.some((record) => record.provenance.retrieval_mode === "aggregate_stats")) {
        warnings.push("NJDG records are aggregate statistical references, not per-case status records.");
    }
    return warnings;
}

function buildCourtDataResponse(raw) {
    const query = parseCourtDataQuery(raw || {});
    const sources = SOURCES.filter((source) => sourceMatchesQuery(source, query)).slice(0, query.limit);
    const retrievedAt = new Date().toISOString();
    const records = sources.map((source) => sourceToRecord(source, query, retrievedAt));
    return { query, records, sources, warnings: buildWarnings(records) };
}

function parseBody(req) {
    if (!req.body) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
}

function parseGetQuery(req) {
    const url = new URL(req.url || "/api/court-data/search", "https://trialsim.app");
    return Object.fromEntries(url.searchParams.entries());
}

export default async function handler(req, res) {
    if (!applyCors(req, res, 'GET, POST, OPTIONS')) return res.status(403).json({ error: 'Origin is not allowed.' });

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!allowRequest(req, { limit: 60, windowMs: 60_000 })) return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });

    try {
        const rawQuery = req.method === "GET" ? parseGetQuery(req) : parseBody(req);
        return res.status(200).json(buildCourtDataResponse(rawQuery));
    } catch (error) {
        if (error instanceof CourtDataQueryError) {
            return res.status(400).json({ error: error.message, allowed: { courtLevel: COURT_LEVELS, dataType: DATA_TYPES, source: SOURCE_IDS } });
        }
        if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON" });
        console.error("Court data gateway failure:", error);
        return res.status(500).json({ error: "Court data gateway failed" });
    }
}
