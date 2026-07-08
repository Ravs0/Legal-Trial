# Official Indian Court Data Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/api/court-data/search` as an official-only Indian court data gateway that returns normalized official source references without scraping restricted court portals.

**Architecture:** Put all pure gateway logic in TypeScript under `services/courtDataGateway.ts` so it can be tested without network access. Add a Vercel-style JavaScript API route at `api/court-data/search.js` that mirrors the existing API route CORS/method/body handling and delegates to the compiled TypeScript-compatible logic. Add tests for parsing, filters, source records, and compliance warnings.

**Tech Stack:** React/Vite app, Vercel Node.js serverless routes, TypeScript service modules, `tsx` tests.

---

## File Structure

- Create: `Projects/Apps/Legal-Trial/services/courtDataGateway.ts`
  - Defines access modes, source metadata, record types, query parsing, filtering, and response builder.
- Create: `Projects/Apps/Legal-Trial/services/courtDataGateway.test.ts`
  - Tests pure gateway behavior without network calls.
- Create: `Projects/Apps/Legal-Trial/api/court-data/search.js`
  - Vercel route that accepts `GET`, `POST`, and `OPTIONS`, then returns the gateway response.
- Modify: `Projects/Apps/Legal-Trial/package.json`
  - Add the new test file to the existing `npm test` script.

## Task 1: Gateway Types, Catalog, and Query Logic

**Files:**
- Create: `services/courtDataGateway.ts`
- Test: `services/courtDataGateway.test.ts`

- [ ] Step 1: Write tests for default source-directory behavior, filter behavior, limit clamping, and invalid filter errors.
- [ ] Step 2: Run `npx tsx services/courtDataGateway.test.ts`; expect failure because the module does not exist.
- [ ] Step 3: Implement `services/courtDataGateway.ts` with source catalog, normalized records, `parseCourtDataQuery`, and `buildCourtDataResponse`.
- [ ] Step 4: Run `npx tsx services/courtDataGateway.test.ts`; expect pass.

## Task 2: Serverless API Route

**Files:**
- Create: `api/court-data/search.js`

- [ ] Step 1: Add a Vercel route with CORS headers matching existing API files.
- [ ] Step 2: Accept `OPTIONS`, `GET`, and `POST`; reject other methods with `405`.
- [ ] Step 3: For `GET`, read query params from `req.url`; for `POST`, parse JSON body.
- [ ] Step 4: Return `400` for invalid filters and `200` for valid gateway responses.
- [ ] Step 5: Run `npm run typecheck`; expect pass.

## Task 3: Test Script Integration

**Files:**
- Modify: `package.json`

- [ ] Step 1: Add `tsx services/courtDataGateway.test.ts` to the `test` script.
- [ ] Step 2: Run `npm test`; expect all service tests pass.
- [ ] Step 3: Run `npm run build`; expect production build pass.

## Self-Review

- Spec coverage: the plan implements the one endpoint, official source catalog, normalized response, explicit access modes, source filtering, invalid filter handling, and network-free tests. It intentionally does not implement live scraping or paid database connectors.
- Placeholder scan: no placeholders remain.
- Type consistency: source ids, court levels, data types, and access mode names match the design spec.
