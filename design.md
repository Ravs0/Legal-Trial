# LexForge visual system — Paper Dossier

## The one-line brief
A law journal, not an app. Warm paper, ink serif, hairline rules, a clerk's red pen.
The Deception Arena is the single exception: hell-black, because the product lives in daylight and the examiner does not.

## Copy law (the bloat fix — this outranks every style rule)
1. **One line per element.** No label + subtitle + explanation stacks. If it needs a sentence to explain what it is, rename it.
2. **Buttons are verbs.** ≤2 words. Never `[ BRACKETED ]`, never "Enter the X to begin Y".
3. **Numbers are bare.** `62/100`, `Turn 4`. No `LOGICAL COHERENCE:` prefixes, no `Mode:` labels.
4. **No status cosplay.** No ENGAGE / ACTIVE / LIVE badges. State is shown, not announced.
5. **Hero = title + ≤10-word subtitle.** Most screens get no subtitle at all.
6. **Explanations live in one place** per screen (an affordance), never repeated inline.
7. No em dashes. No "simply / just / powerful / seamless". No exclamation marks.

## Palette
| Token | Value | Role |
|-------|-------|------|
| paper | `#f7f4ee` | Page |
| paper-2 | `#fdfcf9` | Raised panels/cards |
| well | `#efeae1` | Insets, inputs, code |
| ink | `#1c1914` | Primary text · primary CTA fill |
| ink-2 | `#5f594e` | Secondary text |
| ink-3 | `#8f887a` | Faint text, disabled |
| rule | `#ddd6c8` | Hairline borders |
| rule-strong | `#cbc3b2` | Hover/focus borders |
| clerk-red | `#8a2b23` | The red pen: errors, lies, collapse, ONE accent per screen |
| ochre | `#7a5c12` | Warnings only |

## Type
- **Serif leads everything human**: headings, prose, arguments, feedback. `Source Serif 4`.
- **Mono is the machine voice**: scores, HUD, logs, code. `JetBrains Mono`, 11px floor.
- **Sans (Inter)**: nav labels and button text only.
- Prose 13–16px/relaxed. Nothing below 11px anywhere.

## Rules
1. One primary action per screen: **ink fill, paper text**.
2. Red is scarce. If red appears twice on a screen, one of them is wrong.
3. Borders over cards; radius ≤4px; no shadows except a 1px ring on hover.
4. Photos: duotone-warm, dark gradient only under text that sits on them.
5. Spacing is generous — whitespace is what makes monochrome expensive.
6. Dark surfaces exist ONLY inside the Deception Arena. Nowhere else.
7. Leave mode clears mode + active/pending session (unchanged).

## Shell
Sidebar: paper, active item = ink fill / paper text. Nav groups: Practice · Write · Research · Labs · Reference.
Interior screens: quiet PhotoHero (photo at ~60% visibility), no pattern wallpaper behind prose.

## Module rooms
Every room uses shared chrome (`RoomChrome.tsx`). White space does the separating; rules do the structuring.
