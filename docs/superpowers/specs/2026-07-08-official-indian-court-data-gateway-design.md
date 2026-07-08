# Official Indian Court Data Gateway Design

Date: 2026-07-08
Project: LexForge

## Goal

Create a single LexForge endpoint for official Indian court data research while avoiding paid legal databases and avoiding brittle or non-compliant access patterns. The endpoint should normalize official-source references from Supreme Court, High Court, District Court, judgments, and judicial statistics sources into one response shape.

This first version is a compliant gateway and source directory. It should not bypass captchas, login flows, anti-bot controls, hidden internal AJAX endpoints, or terms of use. Where no documented public API exists, the gateway returns official source links and structured guidance rather than pretending portal-only data is API-backed.

## Official Source Scope

The gateway covers these official source families:

- Supreme Court of India website: case status, judgments, daily orders, cause lists, display boards, office reports, eSCR/SCR, neutral citation, and related public services.
- eCourts District Court Services: CNR search, case status, court orders, cause lists, caveats, process details, and court location references for district and taluka courts.
- eCourts High Court Services: High Court case status, orders, judgments, and cause-list references.
- Judgments and Orders portal: official judgment and order search/download entry point.
- National Judicial Data Grid: aggregate court pendency/disposal/statistical dashboards, modeled separately from case records.
- API Setu: formal government API onboarding route, included as a future connector slot if official court APIs become available through approved access.

Paid or private legal databases are out of scope for this official-only implementation.

## Architecture

Add a serverless API route:

`GET /api/court-data/search`

The route accepts query parameters and dispatches them to source adapters. Each adapter describes what it can support, what kind of access it uses, and what official URLs should be used for deeper lookup.

Initial adapters:

- `sci`: Supreme Court of India public services.
- `ecourts_district`: District Court Services.
- `ecourts_high_court`: High Court Services.
- `judgments_ecourts`: Judgments and Orders portal.
- `njdg`: National Judicial Data Grid aggregate dashboards.
- `api_setu`: formal API onboarding placeholder.

Each adapter returns normalized `CourtDataRecord` objects and `CourtDataSource` metadata. In the first slice, adapters can return source-directory records and official lookup URLs. Later, any adapter with documented official API credentials can add live record retrieval behind the same interface.

## Query Model

Supported query parameters:

- `q`: free-text search term, party name, case number, CNR, or citation text.
- `courtLevel`: optional filter: `supreme_court`, `high_court`, `district`, `aggregate`.
- `dataType`: optional filter: `case_status`, `cause_list`, `order`, `judgment`, `aggregate_stat`, `source_reference`.
- `source`: optional source id filter.
- `limit`: optional result cap, clamped to a small maximum.

If the query is too broad or empty, the endpoint returns source references and recommended official entry points rather than a failure.

## Response Model

The endpoint returns:

```json
{
  "query": {
    "q": "...",
    "courtLevel": "...",
    "dataType": "...",
    "source": "...",
    "limit": 10
  },
  "records": [
    {
      "id": "sci-source-reference",
      "source": "sci",
      "court_level": "supreme_court",
      "court": "Supreme Court of India",
      "data_type": "source_reference",
      "title": "Supreme Court public services",
      "summary": "Official entry points for case status, judgments, daily orders, cause lists, and display boards.",
      "case_number": null,
      "cnr": null,
      "party_names": [],
      "status": null,
      "dates": {},
      "documents": [
        {
          "type": "official_service",
          "title": "Judgments by case number",
          "official_url": "https://www.sci.gov.in/judgements-case-no/",
          "retrieval_mode": "portal_reference"
        }
      ],
      "provenance": {
        "official_source_url": "https://www.sci.gov.in/",
        "retrieved_at": "...",
        "access_basis": "public_official_page",
        "retrieval_mode": "portal_reference"
      }
    }
  ],
  "sources": [
    {
      "id": "sci",
      "name": "Supreme Court of India",
      "coverage": "Supreme Court public services",
      "access": "portal_reference",
      "api_status": "No public documented API found during research",
      "official_url": "https://www.sci.gov.in/"
    }
  ],
  "warnings": [
    "Portal-only sources are returned as official references unless documented API access is configured."
  ]
}
```

## Access Modes

Use explicit access modes to prevent accidental overclaiming:

- `official_api`: documented official API with approved credentials or public documentation.
- `public_artifact`: directly published public documents such as official PDFs or HTML pages, subject to terms and rate limits.
- `portal_reference`: public portal workflow requiring human search, captcha, session handling, or unknown API terms.
- `aggregate_stats`: dashboard/statistical source, not per-case data.

The first implementation should primarily use `portal_reference` and `aggregate_stats`. It should not scrape captcha-protected or session-only search flows.

## Error Handling

- Invalid filters return `400` with allowed values.
- Unsupported source ids return `400` with the source catalog.
- Upstream connector failures are isolated per source and returned as source-level warnings.
- The endpoint always includes provenance and warnings when results are source references rather than live case records.

## Testing

Add focused tests for:

- Query parsing and limit clamping.
- Source filtering.
- Court-level and data-type filtering.
- Normalized response shape.
- Compliance warnings for portal-only sources.

Use the existing TypeScript test style in `package.json` and keep tests independent from network access.

## Implementation Slice

The first implementation should add:

- Shared TypeScript types for court data records, source metadata, query filters, access modes, and response shape.
- A source catalog file listing official sources and official URLs.
- Adapter functions that generate normalized source-reference records.
- Vercel serverless route `api/court-data/search.ts` or `.js`, matching the project’s existing API route style.
- Tests for the pure query/catalog/adapter logic.

This gives LexForge a real internal endpoint immediately while leaving room to add approved API Setu or court-provided credentials later without changing the client-facing contract.
