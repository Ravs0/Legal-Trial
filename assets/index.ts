/**
 * LexForge media registry.
 * Single import surface for screen photo treatments (PhotoHero / PhotoTile / strips).
 * Paths resolve via Vite static asset handling.
 *
 * Design: monochrome / warm-gray photography only (see design.md).
 * No gold glow. Dreadler trio is the Labs red-tint exception.
 */

// Core shell / practice
import heroCourtroom from './hero_courtroom.jpg';
import courtroomLuxury from './courtroom_luxury.jpg';
import judgeGavel from './judge_gavel.jpg';
import counselScales from './counsel_scales.jpg';
import libraryBooks from './library_books.jpg';
import draftingPen from './drafting_pen.jpg';
import strategyAstrolabe from './strategy_astrolabe.jpg';
import personaSeal from './persona_seal.jpg';
import deceptionKey from './deception_key.jpg';

// Expansion stills (media pass)
import courtCorridorNight from './court_corridor_night.jpg';
import trialBinderDesk from './trial_binder_desk.jpg';
import strategyWarRoom from './strategy_war_room.jpg';
import witnessStandEmpty from './witness_stand_empty.jpg';
import logicDiagramSmoke from './logic_diagram_smoke.jpg';

// Labs / Dreadler (red-tint exception)
import dreadlerPortrait from './dreadler_portrait.jpg';
import dreadlerArenaRoom from './dreadler_arena_room.jpg';
import dreadlerLogicWorld from './dreadler_logic_world.jpg';

// Orphan abstract (kept for future hero variants)
import legalHeroAbstract from './legal_hero_abstract.png';

export {
  heroCourtroom,
  courtroomLuxury,
  judgeGavel,
  counselScales,
  libraryBooks,
  draftingPen,
  strategyAstrolabe,
  personaSeal,
  deceptionKey,
  courtCorridorNight,
  trialBinderDesk,
  strategyWarRoom,
  witnessStandEmpty,
  logicDiagramSmoke,
  dreadlerPortrait,
  dreadlerArenaRoom,
  dreadlerLogicWorld,
  legalHeroAbstract,
};

/** Named map for documentation and programmatic lookup. */
export const assets = {
  heroCourtroom,
  courtroomLuxury,
  judgeGavel,
  counselScales,
  libraryBooks,
  draftingPen,
  strategyAstrolabe,
  personaSeal,
  deceptionKey,
  courtCorridorNight,
  trialBinderDesk,
  strategyWarRoom,
  witnessStandEmpty,
  logicDiagramSmoke,
  dreadlerPortrait,
  dreadlerArenaRoom,
  dreadlerLogicWorld,
  legalHeroAbstract,
} as const;

export type AssetKey = keyof typeof assets;

/**
 * Screen → primary photo treatment map (media expansion).
 * Secondary strips/tiles documented in comments on each screen.
 */
export const screenMedia = {
  landing: {
    // Full-bleed entry motif (always visible conversion surface)
    hero: courtCorridorNight,
    logo: courtroomLuxury,
    indian: courtroomLuxury,
    // Distinct from corridor hero; wide empty court for IL tile
    international: heroCourtroom,
  },
  home: {
    heroIdle: heroCourtroom,
    heroActive: courtCorridorNight,
    /** Practice tool tiles — expansion stills preferred */
    cases: libraryBooks,
    drafting: trialBinderDesk,
    draftingAlt: draftingPen,
    bench: witnessStandEmpty,
    benchAlt: judgeGavel,
    /** Labs tiles */
    strategy: strategyWarRoom,
    strategyAlt: strategyAstrolabe,
    personas: personaSeal,
    deception: logicDiagramSmoke,
    deceptionAlt: deceptionKey,
    /** Loop-health / review accents */
    review: counselScales,
    abstract: legalHeroAbstract,
    corridor: courtCorridorNight,
    luxury: courtroomLuxury,
    /**
     * Motif strip under loop health.
     * Prefers previously underused classics so no monochrome still is dead weight on Home.
     */
    strip: [
      { image: draftingPen, label: 'Draft' },
      { image: judgeGavel, label: 'Bench' },
      { image: counselScales, label: 'Review' },
      { image: strategyAstrolabe, label: 'Theory' },
      { image: deceptionKey, label: 'Pressure' },
      { image: legalHeroAbstract, label: 'Form' },
    ] as const,
  },
  setup: {
    hero: courtCorridorNight,
    case: trialBinderDesk,
    bench: witnessStandEmpty,
    counsel: counselScales,
  },
  caseLibrary: {
    hero: trialBinderDesk,
    stripCase: libraryBooks,
    stripBinders: trialBinderDesk,
    stripTheory: strategyWarRoom,
  },
  performance: {
    hero: logicDiagramSmoke,
    sessionStrip: witnessStandEmpty,
  },
  bench: {
    /** Room banner identity (matches Home Bench tile) */
    hero: witnessStandEmpty,
    judges: judgeGavel,
    counsel: counselScales,
  },
  drafting: {
    pen: draftingPen,
    plaints: courtroomLuxury,
    petitions: judgeGavel,
    contracts: libraryBooks,
    notices: counselScales,
  },
  strategy: {
    banner: strategyWarRoom,
    fallback: strategyAstrolabe,
  },
  personas: {
    banner: personaSeal,
  },
  courtSources: {
    hero: courtroomLuxury,
  },
  researchIDE: {
    /** Master manuscript RoomBanner + activity-bar chip */
    banner: libraryBooks,
    /** Workspace explorer strip / sandbox banner */
    workspace: trialBinderDesk,
    stripManuscript: libraryBooks,
    stripTrial: trialBinderDesk,
  },
  dreadler: {
    room: dreadlerArenaRoom,
    world: dreadlerLogicWorld,
    portrait: dreadlerPortrait,
  },
} as const;
