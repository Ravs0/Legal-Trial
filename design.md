# LexForge visual system: the advocate's workspace

Warm paper, considered type, and room to think. The interface supports the work;
it does not imitate a control room.

## Foundations

The shared palette is defined in styles.css and tailwind.config.cjs:

| Role | Token | Value |
|---|---|---|
| Page | paper / brand-bg-primary | #f7f4ee |
| Panel | surface / brand-bg-secondary | #fdfcf9 |
| Inset | well / brand-bg-tertiary | #efeae1 |
| Text | ink / brand-text-primary | #1c1914 |
| Supporting text | secondary / brand-text-secondary | #5f594e |
| Quiet text | muted | #746d60 |
| Rule | rule / brand-border | #ddd6c8 |
| Strong rule | rule-strong / brand-border-light | #cbc3b2 |
| Accent and error | accent / brand-accent | #8a2b23 |

Source Serif 4 leads headings, briefs, and long-form legal reading. Inter handles
navigation, controls, and supporting text. JetBrains Mono is reserved for short
eyebrows, scores, and document references. Text never falls below 11px.

Use hairline borders, 4px controls, and 5–6px panels. Avoid decorative shadows in
workspaces. The landing page's paper brief may cast a subtle physical shadow.
Red is reserved for small brand details, meaningful emphasis, and errors.

## Shared components

- Brand: the column mark and wordmark.
- PageHeader: the daylight page heading, description, and optional actions.
- PhotoHero and RoomBanner: compatibility adapters to PageHeader. Interior
  photographs are small supporting images, not dark backdrops for controls.
- Button, Card, SelectInput, EmptyState, and Modal: shared controls and states.
- RoomTabs: keyboard-operable segmented views; arrow keys, Home, and End work.
- RoomStepper: a quiet sequence with a clear current step.
- Category treatments come from services/colorUtils.ts and use ink tokens.

Changes to these foundations should improve all consumers. Do not recreate them
inside an individual screen.

## Navigation and flow

The sidebar exposes every shipped tool, grouped into Your practice, The workbench,
and Think further. The active item stays visible in its scroll area. The header
carries location and coach access. Mobile uses a labelled drawer with focus
restoration, Escape, and a focus trap.

The main journey is landing → jurisdiction → overview → hearing setup → practice
→ performance. Suggested cases and command search deep-link into setup. A hearing
can return to the overview and resume. Leaving a workspace confirms before
clearing an active hearing.

Overview metrics reflect saved hearings in the selected jurisdiction. Never use
fabricated user statistics, testimonials, progress, or provider success states.

The research desk offers a manuscript and an editing workspace. Preserve content
while changing views. Split panes need at least 760px of available editor width.
Adjacent panels become closable drawers when space is limited; researching a
selection reveals the results.

## Copy and states

Use concrete verbs and short names: New hearing, Begin hearing, Research desk.
One useful sentence beats several stacked explanations. Empty states identify
the next action. Errors preserve the user's draft and offer a way forward.

Use fictional or anonymized training material. Keep source-verification and AI
consent labels. Training output is not legal advice. Local storage and provider
requests are different data boundaries and must be described accurately.

Deception Arena keeps its distinct dark setting. Its foregrounds must remain
legible; daylight palette changes must not turn its text dark. White text is also
appropriate over genuinely dark photographs, with sufficient scrim contrast.

Honor reduced motion. Workspace content appears immediately. Keep visible focus
indicators and touch targets, and check both desktop and phone layouts.
