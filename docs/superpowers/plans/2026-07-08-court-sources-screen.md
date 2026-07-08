# Court Sources Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated LexForge `Court Sources` screen that embeds the official Indian court data gateway without adding more weight to Research IDE.

**Architecture:** Keep the feature isolated behind a new screen and a small frontend service wrapper. The screen calls `/api/court-data/search`, renders official source cards, and links users to original court services while preserving the compliance boundary that portal-only sources are references, not scraped live data.

**Tech Stack:** React 19, TypeScript, React Router, Vite, Vercel serverless API route already implemented.

---

## File Structure

- Create: `services/courtSourcesService.ts`
  - Frontend types and `searchOfficialCourtSources()` wrapper around `/api/court-data/search`.
- Create: `screens/CourtSourcesScreen.tsx`
  - Dedicated search/filter UI and result cards.
- Modify: `constants.ts`
  - Add `ROUTES.COURT_SOURCES`.
- Modify: `App.tsx`
  - Lazy-load and route the new screen.
- Modify: `components/Layout.tsx`
  - Add `Court Sources` under the Research nav group.

## Tasks

### Task 1: Service Wrapper

- [ ] Create `services/courtSourcesService.ts` with exact response types matching `/api/court-data/search`.
- [ ] Implement `searchOfficialCourtSources(params)` using `POST` and JSON.
- [ ] Return an empty but valid response for empty network failures only by throwing a typed error to the screen.

### Task 2: Screen

- [ ] Create `screens/CourtSourcesScreen.tsx`.
- [ ] Add local state for query, source, court level, data type, loading, error, and response.
- [ ] On submit, call `searchOfficialCourtSources()`.
- [ ] Render summary stats, warnings, and official source cards.
- [ ] Link official URLs with `target="_blank"` and `rel="noopener noreferrer"`.

### Task 3: Routing and Navigation

- [ ] Add `COURT_SOURCES: '/court-sources'` to `ROUTES`.
- [ ] Lazy-load `CourtSourcesScreen` in `App.tsx`.
- [ ] Add a route wrapped in `Layout`, `ErrorBoundary`, `React.Suspense`, and `ModeSpecificRoute`.
- [ ] Add a sidebar nav item under Research labeled `Court Sources`.

### Task 4: Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

## Self-Review

- Scope is one screen only and does not redesign Research IDE.
- The screen only consumes the compliant official gateway.
- No paid database or scraper behavior is introduced.
