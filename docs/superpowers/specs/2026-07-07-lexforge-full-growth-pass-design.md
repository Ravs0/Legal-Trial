# LexForge Full Growth Pass Design

Date: 2026-07-07

## Goal

Make LexForge easier to try, easier to trust, and easier to share by turning the app around one repeatable user loop:

Start fast -> practice -> get proof of improvement -> share/export -> repeat.

This pass improves product activation, retention, sharing, measurement, and technical stability inside the existing React/Vite app. It does not add hosted accounts, payments, external analytics vendors, or a new backend database.

## Current Findings

- First use has too much configuration before the user experiences the courtroom simulator.
- The dashboard presents many advanced modules at once, which dilutes the primary mock-trial loop.
- Completed sessions are stored locally but not surfaced as a clear progress or habit loop.
- Performance analysis exists, but there is no easy way to export or share a useful scorecard.
- There is no product analytics abstraction, so drop-off points are invisible.
- The production Vite build succeeds, but TypeScript project checking fails in the core courtroom flow.
- The first bundle includes heavy advanced assets, including ONNX runtime output, before users necessarily need those features.
- Product naming is split between LexForge and the older TrialSim name.

## Product Design

### Activation

Add a one-click demo trial entry point on the landing page and dashboard. The demo starts a preconfigured beginner Indian-law session without sending the user through the full setup form.

Default demo configuration:
- Practice mode: Indian.
- Case: first beginner Indian case if available, otherwise first Indian case.
- Judge: first available Indian judge.
- Opposing counsel: first available Indian opposing counsel.
- Duration: Quick.
- Difficulty: case difficulty.

The demo should persist settings through the same pending/active session path as normal setup, so the arena code does not need a separate demo mode. It may include a small local flag or route state for copy/analytics, but courtroom behavior remains the same.

### Dashboard

Restructure the dashboard around primary actions first:
- Start Demo Trial.
- Start New Trial.
- Resume Active Session, when one exists.
- Open Drafting Studio.

Move advanced tools into a secondary section:
- AI Personas.
- Strategy Room.
- Deception Arena.
- Case Library.
- Judges.
- Opposing Counsel.

The dashboard should show progress and next action above the advanced modules. It should not require the user to understand the full ecosystem before starting a session.

### Retention

Add a local progress summary using completed sessions already stored in localStorage.

Metrics:
- Completed sessions count.
- Latest overall score, when analysis exists.
- Best overall score, when analysis exists.
- Recent improvement areas from the latest analyzed session.
- Suggested next action: resume active session, start demo, retry setup, or open drafting.

No backend account system is included. The progress panel should gracefully handle empty history and missing analysis.

### Sharing and Export

Add export actions to the performance screen:
- Copy score summary to clipboard.
- Download scorecard as Markdown.
- Download transcript as Markdown.

The scorecard should include:
- Product name.
- Mode.
- Case title.
- Judge and opposing counsel.
- Overall score and category scores.
- Improvement areas.
- Short text summary suitable for sharing.

The transcript export should include speaker names, timestamps where available, and message text. It should not require a server round-trip.

### Analytics

Add a lightweight analytics service with a stable interface:

```ts
trackEvent(name, properties?)
getRecentEvents()
```

For this pass, analytics stores recent events locally and logs them in development. It must not send data to an external service. This makes instrumentation visible and allows a future PostHog/Mixpanel adapter without rewriting components.

Initial events:
- landing_viewed.
- practice_mode_selected.
- demo_trial_started.
- dashboard_viewed.
- setup_session_started.
- first_argument_sent.
- session_completed.
- analysis_viewed.
- scorecard_copied.
- scorecard_downloaded.
- transcript_downloaded.
- second_session_started, when completed-session count is already at least one before a new trial starts.

Event properties should avoid full legal drafts or transcript text. Include compact metadata such as mode, route, case id/title, session type, and whether analysis was available.

## Technical Design

### TypeScript Stabilization

Fix the current TypeScript errors in the courtroom path:
- Allow or remove the `idle` analysis status consistently.
- Move timer-derived values above callbacks that depend on them, or refactor callbacks so they do not capture variables before declaration.
- Align objection metadata with `ObjectionDetails`; use `basis` instead of `explanation`, and use the correct quick-objection variable.
- Replace invalid message kind values such as `judge_question` with valid `TrialMessageKind` members.
- Handle optional `elapsedSeconds` and `activePhase` in home/progress displays.
- Restore timer state using the actual `useTimer` API rather than passing unsupported arguments.

The acceptance criterion is `tsc --noEmit -p tsconfig.json` passing.

### Performance

Code-split advanced screens using `React.lazy` and `Suspense` where practical:
- AI Personas.
- Strategy Room.
- Deception Arena.
- Drafting Studio, if it does not hurt the primary path.

The primary landing, dashboard, setup, practice, and performance paths should remain directly usable. Advanced routes can show the existing loading spinner while their chunks load.

The goal is to reduce the initial JS burden and keep heavy advanced assets out of the main activation path where Vite can split them.

### Brand Cleanup

Update public metadata and documentation to consistently identify the app as LexForge while preserving compatibility with older TrialSim references only where needed.

Targets:
- package name.
- README title and description.
- Any visible stale TrialSim naming in app copy, except deprecated compatibility names in code comments where changing them would increase risk.

### Error Handling

AI health failures should remain honest. The app should not fabricate model responses. For user experience:
- Demo start should not call AI until the arena needs it.
- If `/api/chat` is unavailable, the arena should surface the existing clear error and leave the user able to return to setup/dashboard.
- Export actions should work even if AI analysis is missing, using transcript and available session metadata.

## Components and Files

Likely touched files:
- `App.tsx` for lazy route loading.
- `screens/LandingScreen.tsx` for demo CTA and analytics.
- `screens/HomeScreen.tsx` for simplified dashboard, progress summary, and analytics.
- `screens/SetupScreen.tsx` for setup instrumentation and second-session detection.
- `screens/PracticeArena.tsx` for TypeScript fixes and session event tracking.
- `screens/PerformanceScreen.tsx` for progress/share/export actions and analytics.
- `services/storageService.ts` for any small helper needed around completed-session summaries.
- `services/analyticsService.ts` as a new local analytics abstraction.
- `services/exportService.ts` as a new scorecard/transcript export helper if that keeps the performance screen clean.
- `constants.ts` for demo selection helpers only if local helper placement is cleaner there.
- `README.md`, `package.json`, and `package-lock.json` for branding cleanup.

## Testing and Verification

Required checks:
- `npm run build` succeeds.
- `npm exec -- tsc --noEmit -p tsconfig.json` succeeds.
- Manual flow: landing -> start demo -> arena opens.
- Manual flow: setup -> start trial -> send first argument path still works as far as possible without requiring a live AI key.
- Manual flow: performance page export actions work on available completed-session data.
- Confirm analytics events are stored locally and do not include transcript/draft body text.

## Out of Scope

- Hosted user accounts.
- Payment or subscription flows.
- External analytics service integration.
- Backend persistence of transcripts or scores.
- Full redesign of every advanced module.
- Implementing international case-law lookup.
- Replacing the AI provider.

## Rollout Risk

The riskiest file is `PracticeArena.tsx` because it owns session state, timer state, AI streaming, objections, and analysis. Keep changes there surgical: fix types, add minimal event tracking, and avoid behavioral rewrites unless required by the TypeScript errors.

Dashboard and export changes are lower risk because they mostly read existing state and call existing navigation/storage utilities.
