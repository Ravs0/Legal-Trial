# LexForge visual system (anti-slop)

## Goal
Inside and outside the app should feel like **one product**: flat, dense, decision-first. Not brass/forest “premium AI” SaaS.

## Color (tint system, not green kit)
Brand-tint advice from product design discourse: backgrounds and text share one family so the UI feels intentional, not multi-hue UI-kit.

| Token | Value | Role |
|-------|--------|------|
| bg | `#0a0a0a` / `#111` / `#1a1a1a` | Surfaces |
| text | `#e8e6e3` / `#9a9690` | Primary / secondary |
| accent | `#c4bfb6` (warm gray) | Rare highlight only |
| border | `#2a2a2a` / `white/10` | Structure |
| primary CTA | white fill, black text | Hierarchy |
| success | neutral gray (not green) | Avoid traffic-light green cast |
| category colors | monochrome | No emerald/sage forest map |

## Rules
1. **One primary action per screen** (what decision now?)
2. **Progressive disclosure**: core loop first, Labs last
3. **No gold/green glow**, soft orbs, or lift shadows on CTAs
4. **No em dashes** in product UI copy
5. **borders over cards**: `border-white/10`, gap-px grids
6. **Primary button** = white on black
7. **Radius**: prefer square / minimal
8. **Type**: tight hierarchy; no giant serif heroes in chrome
9. **Background**: solid `#0a0a0a`, no geometry wallpaper on shell
10. **Leave mode** must clear mode + active/pending session (never rehydrate mode from storage when user clears)
11. **Complex app tip**: surface loop health, not every module

## Leave mode behavior
`endPracticeMode()` clears: localStorage practiceMode, active session, pending settings, chat handles, then navigate to landing.

## Shell
- Sidebar: flat, active = white bg black text; subtle dot pattern chrome
- Nav groups: Practice · Write · Research · Labs · Reference
- Home: PhotoHero + stats (PatternPanel) + PhotoTile grids
- Interior screens: PhotoHero banners, PatternPanel (grid/dots/lines), photo strip accents
- Shared: `PhotoHero`, `PhotoTile`, `SurfacePattern` / `PatternPanel`

## Photography
Use real assets from `/assets` (courtroom, gavel, library, pen, scales). Gradients over photos, monochrome diagonal hatch at low opacity. No gold glow.

## Module rooms (not abandoned shells)
Every major room uses shared chrome:
- `RoomBanner` + `RoomTabs` / `RoomStepper` / `RoomFrame` (`components/RoomChrome.tsx`)
- Drafting, Strategy, Personas, Research IDE, Case Library, Court Sources, Bench, Review, Setup, Home
- White = selected control; no gold glow CTAs; photo strips + PatternPanel for forms
