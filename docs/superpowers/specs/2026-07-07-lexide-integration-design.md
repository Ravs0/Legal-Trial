# LexIDE Integration Design

Date: 2026-07-07

## Goal

Integrate LexIDE (legal research IDE with split-view editing, Gemini AI grounding, footnote management, and citation generation) into LexForge as a new standalone screen, matching LexForge's existing navy & gold glassmorphic theme.

## What LexIDE Provides

- **Master Manuscript view**: paste raw legal text, use AI Smart Split to auto-parse into sections
- **IDE Workspace**: split-view or single-view section editor with explorer sidebar
- **Neural Sandbox**: AI-powered cross-document consistency checker with refinement chat
- **Research Sidebar**: Google Search grounded legal research via Gemini, with summarization and one-click citation
- **Footnote Management**: per-section footnote tracking with ILI/OSCOLA citation styles
- **Session Persistence**: auto-save to localStorage

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `screens/ResearchIDEScreen.tsx` | Main screen component (lazy-loaded) |
| `screens/lexide/Editor.tsx` | Split-view section editor (adapted from LexIDE) |
| `screens/lexide/ResearchSidebar.tsx` | Gemini-grounded research panel (adapted) |
| `screens/lexide/NeuralSandbox.tsx` | AI consistency checker (extracted from App.tsx) |
| `screens/lexide/MasterManuscript.tsx` | Raw text input + AI Smart Split (extracted) |
| `services/lexideService.ts` | Gemini API wrapper, replacing LexIDE's geminiService.ts |
| `services/citationService.ts` | Footnote/citation generation logic |

### Modified Files

| File | Change |
|------|--------|
| `App.tsx` | Add lazy route for `/research-ide` |
| `constants.ts` | Add `RESEARCH_IDE` route constant |
| `components/Layout.tsx` | Add "Research IDE" nav item to sidebar |
| `components/CommandPalette.tsx` | Add "Open Research IDE" command |
| `types.ts` | Add LexIDE-specific types (Section, Footnote, ResearchResult, etc.) |

### Not Modified

- `PracticeArena.tsx` — no changes needed
- `DraftingStudioScreen.tsx` — stays independent
- Existing services (aiService, storageService) — LexIDE uses its own Gemini service

## UI/UX Design

### Theme Mapping

LexIDE's zinc/blue palette maps to LexForge's brand system:

| LexIDE (current) | LexForge (target) |
|------------------|-------------------|
| `bg-[#09090b]` | `bg-brand-bg-dark` |
| `bg-[#111113]` | `bg-brand-bg-dark-secondary` |
| `bg-[#141417]` | `bg-brand-bg-dark` |
| `text-zinc-300` | `text-brand-text-primary` |
| `text-zinc-500` | `text-brand-text-secondary` |
| `blue-500/600` | `brand-accent` (gold) |
| `purple-500/600` | `brand-purple` or `brand-accent` |
| `border-zinc-800` | `border-brand-border` |

### Layout

The screen follows LexForge's existing pattern:
- Full-height flex container with `h-full overflow-y-auto custom-scrollbar`
- Header bar with screen title and action buttons
- Main content area with the IDE layout
- Status bar at bottom

### Navigation

- Sidebar item: "Research IDE" with `BookOpen` icon
- Route: `/research-ide`
- Lazy-loaded via `React.lazy` (same pattern as DraftingStudio, StrategyRoom)
- Command palette entry: "Open Research IDE"

## Data Flow

```
User pastes text → MasterManuscript
  → AI Smart Split (Gemini) → parsed sections
  → Sections stored in component state (localStorage persistence)

User selects section → Editor (split or single view)
  → Real-time editing
  → Footnote management
  → Text selection → ResearchSidebar

ResearchSidebar → Gemini Google Search grounding
  → Results displayed
  → "Cite" adds footnote to active section
  → "Summarize" generates bullet-point summary

Neural Sandbox → Cross-document consistency analysis
  → AI refinement with user intent
  → Commit changes back to section
```

## Integration Points

### Gemini API

LexIDE uses `@google/genai` directly. For LexForge integration:
- Create `services/lexideService.ts` that wraps the Gemini calls
- Uses the same `GEMINI_API_KEY` from `.env.local` (LexForge already has this)
- Exports: `parseLegalPaper()`, `analyzeLegalConsistency()`, `refineLegalWithIntent()`, `performLegalResearch()`, `summarizeSource()`

### Session Persistence

- LexIDE auto-saves to `localStorage` under `lexide_v1_session`
- LexForge uses `storageService.ts` for session management
- Keep LexIDE's独立 persistence key (`lexide_v1_session`) to avoid conflicts
- Add LexIDE completed sessions to LexForge's progress tracking

### Analytics

- Track: `research_ide_opened`, `ai_smart_split_used`, `research_performed`, `citation_added`, `sandbox_used`
- Use LexForge's existing `trackEvent()` from `analyticsService.ts`

## Out of Scope

- Modifying LexForge's existing screens
- Adding LexIDE features to the practice arena
- Changing LexIDE's Gemini API integration to use LexForge's aiService
- Backend persistence of research data

## Risk

Low risk. This is a new screen addition with no changes to existing functionality. The only shared touchpoints are routing (App.tsx), navigation (Layout.tsx), and the command palette — all mechanical additions.
