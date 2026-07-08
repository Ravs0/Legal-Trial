# LexForge Reliability Gate Design

Date: 2026-07-08

## Goal

Make LexForge's engineering quality repeatable by adding an explicit local verification gate and deterministic coverage for core pure services.

The app already has a strict TypeScript configuration and a Vite production build, but the package scripts only expose `vite build`. This pass turns type safety and service behavior into commands that can be run before future changes are shipped.

## Current Findings

- `package.json` exposes `dev`, `build`, and `preview`; it does not expose `typecheck`, `test`, or a combined verification script.
- `tsconfig.json` enables strict TypeScript checks including unused checks and `noImplicitReturns`.
- The earlier LexForge growth-pass spec listed `tsc --noEmit -p tsconfig.json` as an acceptance criterion, so this pass formalizes that requirement in the project scripts.
- Existing deterministic tests live in the vision subsystem, but ordinary product services such as scoring and export helpers do not appear to have a scriptable test gate.
- `PracticeArena.tsx` is documented as high-risk. This pass should avoid touching it unless the new typecheck exposes an error there.

## Product Impact

This is not a visible feature pass. Its product value is reduced regression risk in the flows users already care about:

- legal writing score summaries should remain stable and explainable;
- scorecard and transcript exports should remain deterministic;
- future UI or AI-layer changes should fail fast when they break TypeScript contracts.

## Technical Design

### Verification Scripts

Add package scripts that make the intended gates discoverable:

```json
{
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "<verified TypeScript test runner command>",
  "check": "npm run typecheck && npm run test && npm run build"
}
```

Choose the `test` command during implementation after checking what is actually available in this project. If a TypeScript runner is already available through the installed toolchain, use it directly. If not, add the smallest dev dependency needed for no-framework TypeScript tests and update the lockfile. Keep the test command explicit rather than hiding it behind a custom shell script.

### TypeScript Stabilization

Run the new `typecheck` command after adding it. Fix only errors exposed by the command. Keep fixes mechanical and local:

- align mismatched types with existing domain types;
- remove or use unused declarations;
- avoid broad rewrites in routing, arena state, or AI streaming;
- preserve honest AI failure behavior and existing user-visible flows.

If typecheck reveals a large unrelated design issue, stop and report the finding instead of hiding it behind a sprawling refactor.

### Core Service Tests

Add deterministic no-network tests around pure service logic. Initial targets:

- `services/legalWritingScorer.ts`: verify scoring returns stable categories, totals, or feedback markers for representative weak and strong legal-writing samples.
- `services/exportService.ts`: verify scorecard and transcript export text includes required metadata, scores, improvement areas, speakers, and message text without requiring browser downloads.

Prefer testing pure helper outputs over DOM, clipboard, or download side effects. If the export service currently mixes pure formatting with browser side effects, extract small formatting helpers and test those helpers while leaving the browser-facing functions intact.

### Test Harness Style

Use the simplest harness that fits the repo:

- no framework if a small assertion helper is enough;
- explicit thrown errors on failure;
- clear console output on success;
- no network calls;
- no dependency on a running Vite dev server.

The tests should be readable as executable examples of the service contracts.

## Error Handling

The verification commands should fail loudly and exit non-zero. Tests should include enough context in assertion messages to identify the broken contract.

Export formatting tests should cover missing optional data where the product supports it, especially missing analysis or missing timestamps. They should not require AI-generated content.

## Components and Files

Likely touched files:

- `package.json` for scripts and any minimal dev dependency.
- `package-lock.json` if a dev dependency is added.
- `services/legalWritingScorer.ts` only if small test seams are needed.
- `services/exportService.ts` only if pure formatting helpers need to be exported or separated.
- New service test files near the services they cover, such as `services/legalWritingScorer.test.ts` and `services/exportService.test.ts`.

Files to avoid unless typecheck requires them:

- `screens/PracticeArena.tsx`.
- route structure in `App.tsx`.
- serverless API files.

## Testing and Verification

Required checks:

- `npm run typecheck` succeeds.
- `npm run test` succeeds.
- `npm run build` succeeds.
- `npm run check` succeeds.

Optional checks if environment support is present:

- `npx tsx vision/shared/pos.test.ts` still succeeds.
- `cd vision/backend && python3 test_pos.py` still succeeds.

## Out of Scope

- New user-facing features.
- Full test framework migration.
- End-to-end browser automation.
- New backend services.
- External analytics, telemetry, or CI service configuration.
- Rewriting risky arena state logic except for direct typecheck fixes.

## Rollout Risk

The main risk is turning on a strict gate that exposes pre-existing type debt. The implementation should make that debt visible and fix contained issues, but it should not convert this pass into a broad product rewrite.

The second risk is testing implementation details instead of contracts. Tests should assert stable service outputs users and components rely on, not incidental wording or private intermediate variables unless those details are the contract.
