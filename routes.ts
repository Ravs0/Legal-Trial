/**
 * Canonical app name and path map for LexForge.
 * Single source of truth — do not redefine ROUTES or APP_NAME elsewhere.
 * Other modules may re-export from here (e.g. constants.ts) for convenience.
 */
export const APP_NAME = 'LexForge';

export const ROUTES = {
  LANDING: '/landing',
  HOME: '/dashboard',
  SETUP: '/setup',
  PRACTICE: '/practice',
  ANALYSIS: '/analysis',
  LIBRARY: '/library',
  JUDGES: '/judges',
  OPPOSING_COUNSEL: '/opposing-counsel',
  BENCH: '/bench',
  DRAFTING_STUDIO: '/drafting-studio',
  PERSONAS: '/ai-personas',
  STRATEGY: '/strategy-room',
  DREADLER: '/deception-arena',
  RESEARCH_IDE: '/research-ide',
  COURT_SOURCES: '/court-sources',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
