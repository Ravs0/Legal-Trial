type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsEvent {
  id: string;
  name: string;
  timestamp: string;
  properties: Record<string, string | number | boolean | null>;
}

interface AnalyticsEnvelope {
  version: number;
  savedAt: string;
  events: AnalyticsEvent[];
}

const ANALYTICS_KEY = 'lexforge.analytics-events';
const ANALYTICS_VERSION = 1;
const MAX_EVENTS = 100;
/** Soft cap so a single oversized property blob cannot exhaust localStorage. */
const MAX_SERIALIZED_BYTES = 48_000;
/** Hard cap for individual string property values. */
const MAX_STRING_PROP = 120;
/** Product catalog titles may be slightly longer; still far below draft text. */
const MAX_CATALOG_TITLE = 160;

/**
 * Stable event names used across LexForge. Prefer helpers below for key flows so
 * property shapes stay privacy-safe and consistent.
 */
export const AnalyticsEvents = {
  LANDING_VIEWED: 'landing_viewed',
  PRACTICE_MODE_SELECTED: 'practice_mode_selected',
  DEMO_TRIAL_STARTED: 'demo_trial_started',
  DASHBOARD_VIEWED: 'dashboard_viewed',
  SETUP_SESSION_STARTED: 'setup_session_started',
  SECOND_SESSION_STARTED: 'second_session_started',
  FIRST_ARGUMENT_SENT: 'first_argument_sent',
  TRIAL_TIMER_STARTED: 'trial_timer_started',
  SESSION_COMPLETED: 'session_completed',
  ANALYSIS_VIEWED: 'analysis_viewed',
  SCORECARD_COPIED: 'scorecard_copied',
  SCORECARD_DOWNLOADED: 'scorecard_downloaded',
  TRANSCRIPT_DOWNLOADED: 'transcript_downloaded',
  RESEARCH_IDE_OPENED: 'research_ide_opened',
  AI_SMART_SPLIT_USED: 'ai_smart_split_used',
  RESEARCH_PERFORMED: 'research_performed',
  CITATION_ADDED: 'citation_added',
  DREADLER_TURN_FAILED: 'dreadler_turn_failed',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents] | (string & {});

/**
 * Property keys that must never be stored — free-text user content, drafts,
 * transcripts, search queries, messages, or raw server error bodies.
 * Matched case-insensitively after normalizing separators.
 */
const SENSITIVE_PROPERTY_KEYS = new Set([
  'query',
  'searchquery',
  'search_query',
  'text',
  'message',
  'messages',
  'body',
  'content',
  'draft',
  'fullcontent',
  'full_content',
  'transcript',
  'userinput',
  'user_input',
  'usertext',
  'user_text',
  'prompt',
  'argument',
  'arguments',
  'response',
  'characterresponse',
  'character_response',
  'servererror',
  'server_error',
  'error',
  'errormessage',
  'error_message',
  'stack',
  'snippet',
  'summary',
  'title', // free-form titles; catalog caseTitle uses explicit allow-path
  'notes',
  'note',
]);

/** Runtime check so Node tests can install a window mock before calling APIs. */
const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizePropKey = (key: string): string => key.trim().toLowerCase().replace(/[\s-]+/g, '_');

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizePropKey(key);
  if (SENSITIVE_PROPERTY_KEYS.has(normalized)) return true;
  // Catch compound keys like raw_query, draft_text, user_message.
  if (/(^|_)(query|transcript|draft|prompt|user_input|full_content)(_|$)/.test(normalized)) return true;
  if (/(^|_)(message|messages|stack|snippet)(_|$)/.test(normalized)) return true;
  return false;
};

const clipString = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value;

/**
 * Sanitize properties before persistence. Drops free-text / sensitive keys,
 * keeps only primitive scalars, and hard-caps string length.
 */
export const cleanProperties = (properties: AnalyticsProperties = {}): AnalyticsEvent['properties'] => {
  const safe: AnalyticsEvent['properties'] = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (!key || typeof key !== 'string') continue;
    if (isSensitiveKey(key)) continue;
    if (typeof value === 'string') {
      safe[key] = clipString(value, MAX_STRING_PROP);
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      safe[key] = value;
    } else if (typeof value === 'boolean' || value === null) {
      safe[key] = value;
    }
  }
  return safe;
};

const createEventId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `event-${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
};

const isAnalyticsEvent = (value: unknown): value is AnalyticsEvent => {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.timestamp !== 'string') {
    return false;
  }
  if (value.properties != null && !isPlainObject(value.properties)) return false;
  return true;
};

const parseStoredEvents = (raw: string): AnalyticsEvent[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  // Versioned envelope (v1+)
  if (isPlainObject(parsed) && parsed.version === ANALYTICS_VERSION && Array.isArray(parsed.events)) {
    return parsed.events.filter(isAnalyticsEvent);
  }

  // Legacy: bare array of events (pre-versioning). Migrate in place on next write.
  if (Array.isArray(parsed)) {
    return parsed.filter(isAnalyticsEvent);
  }

  return [];
};

const writeEvents = (events: AnalyticsEvent[]): boolean => {
  if (!isBrowser()) return false;
  let next = events.slice(-MAX_EVENTS);
  const envelope: AnalyticsEnvelope = {
    version: ANALYTICS_VERSION,
    savedAt: new Date().toISOString(),
    events: next,
  };

  try {
    let serialized = JSON.stringify(envelope);
    // If over soft size cap, drop oldest events until it fits.
    while (serialized.length > MAX_SERIALIZED_BYTES && next.length > 1) {
      next = next.slice(1);
      envelope.events = next;
      envelope.savedAt = new Date().toISOString();
      serialized = JSON.stringify(envelope);
    }
    window.localStorage.setItem(ANALYTICS_KEY, serialized);
    return true;
  } catch {
    // Analytics must never break the product flow.
    return false;
  }
};

export const getRecentEvents = (): AnalyticsEvent[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(ANALYTICS_KEY);
    if (!raw) return [];
    return parseStoredEvents(raw);
  } catch {
    return [];
  }
};

export const trackEvent = (name: string, properties: AnalyticsProperties = {}) => {
  if (!isBrowser()) return;
  if (typeof name !== 'string' || !name.trim()) return;

  const event: AnalyticsEvent = {
    id: createEventId(),
    name: name.trim().slice(0, 120),
    timestamp: new Date().toISOString(),
    properties: cleanProperties(properties),
  };

  const nextEvents = [...getRecentEvents(), event].slice(-MAX_EVENTS);
  writeEvents(nextEvents);

  try {
    if (import.meta.env.DEV) {
      console.info('[LexForge analytics]', event.name, event.properties);
    }
  } catch {
    /* import.meta may be unavailable in some test runners */
  }
};

/** Best-effort clear for tests / privacy controls. */
export const clearAnalyticsEvents = (): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ANALYTICS_KEY);
  } catch {
    /* noop */
  }
};

// ─── Privacy-safe helpers for key product flows ─────────────────────────────

const asCatalogId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // IDs only — reject anything that looks like free prose.
  if (trimmed.length > 64) return undefined;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(trimmed)) return undefined;
  return trimmed;
};

const asCatalogTitle = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return clipString(trimmed, MAX_CATALOG_TITLE);
};

const asShortToken = (value: unknown, max = 64): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) return clipString(trimmed, max);
  // Reject multi-line or prose-looking blobs.
  if (/[\r\n]/.test(trimmed)) return undefined;
  return trimmed;
};

const asFiniteInt = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
};

export type DemoStartSource = 'landing' | 'dashboard' | 'unknown' | (string & {});

export interface DemoStartProps {
  source?: DemoStartSource;
  mode?: string | null;
  caseId?: string | null;
  /** Product catalog case title only — not user-authored. */
  caseTitle?: string | null;
  replacedActiveSession?: boolean;
}

/**
 * Activation funnel: user started the one-click demo trial.
 * Safe props only (mode, catalog case id/title, source). Never logs drafts.
 */
export const trackDemoTrialStarted = (props: DemoStartProps = {}): void => {
  const properties: AnalyticsProperties = {
    source: asShortToken(props.source ?? 'unknown', 32) ?? 'unknown',
    mode: asShortToken(props.mode ?? undefined, 32) ?? null,
    caseId: asCatalogId(props.caseId ?? undefined) ?? null,
    caseTitle: asCatalogTitle(props.caseTitle ?? undefined) ?? null,
  };
  if (typeof props.replacedActiveSession === 'boolean') {
    properties.replacedActiveSession = props.replacedActiveSession;
  }
  trackEvent(AnalyticsEvents.DEMO_TRIAL_STARTED, properties);
};

export type DreadlerErrorClass =
  | 'network'
  | 'misconfigured'
  | 'provider'
  | 'rate_limit'
  | 'invalid'
  | 'stale_token'
  | 'server'
  | 'empty_response'
  | 'missing_state'
  | 'http'
  | 'unknown';

/**
 * Map HTTP / client failure signals to a coarse error class.
 * Never pass raw error message text into analytics — only this class + status.
 */
export const classifyDreadlerTurnError = (input: {
  status?: number | null;
  networkHint?: boolean;
  serverError?: string | null;
  message?: string | null;
}): DreadlerErrorClass => {
  const status = typeof input.status === 'number' && Number.isFinite(input.status) ? input.status : undefined;
  const server = typeof input.serverError === 'string' ? input.serverError : '';
  const message = typeof input.message === 'string' ? input.message : '';
  const blob = `${server} ${message}`;

  if (
    input.networkHint ||
    (!status && /failed to fetch|networkerror|load failed|network/i.test(blob))
  ) {
    return 'network';
  }
  if (status === 503 || /DREADLER_STATE_SECRET/i.test(blob)) return 'misconfigured';
  if (/DEEPSEEK_API_KEY|API key|Zenmux|model provider/i.test(blob)) return 'provider';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 413) return 'invalid';
  if (status === 409 || /stale state token|turn_count is behind/i.test(blob)) return 'stale_token';
  if (/empty response/i.test(blob)) return 'empty_response';
  if (/missing state_data/i.test(blob)) return 'missing_state';
  if (status === 500) return 'server';
  if (status) return 'http';
  return 'unknown';
};

export interface DreadlerTurnFailProps {
  world?: string | null;
  skin?: string | null;
  status?: number | null;
  errorClass?: DreadlerErrorClass | string;
  turnCount?: number | null;
  networkHint?: boolean;
}

/**
 * Dreadler arena: a turn request failed (network, config, provider, stale token, …).
 * Does not store user_input, character_response, or raw error strings.
 */
export const trackDreadlerTurnFailed = (props: DreadlerTurnFailProps = {}): void => {
  const status = asFiniteInt(props.status ?? undefined);
  const errorClass =
    asShortToken(props.errorClass ?? undefined, 32) ||
    classifyDreadlerTurnError({
      status: status ?? null,
      networkHint: props.networkHint,
    });

  trackEvent(AnalyticsEvents.DREADLER_TURN_FAILED, {
    world: asCatalogId(props.world ?? undefined) ?? asShortToken(props.world ?? undefined, 48) ?? null,
    skin: asCatalogId(props.skin ?? undefined) ?? asShortToken(props.skin ?? undefined, 48) ?? null,
    status: status ?? null,
    errorClass,
    turnCount: asFiniteInt(props.turnCount ?? undefined) ?? null,
  });
};

export type ResearchSearchOutcome = 'success' | 'empty' | 'error' | 'invalid';

export interface ResearchSearchProps {
  /** Character length of the query — never the query text itself. */
  queryLength?: number | null;
  resultCount?: number | null;
  available?: boolean | null;
  outcome?: ResearchSearchOutcome | string;
  source?: string | null;
  /** Optional provider / path label (e.g. web). */
  provider?: string | null;
}

/**
 * Research IDE search executed. Logs only length + counts + outcome —
 * never the query string, snippets, or titles from results.
 */
export const trackResearchSearch = (props: ResearchSearchProps = {}): void => {
  const queryLength = asFiniteInt(props.queryLength ?? undefined);
  const resultCount = asFiniteInt(props.resultCount ?? undefined);
  const outcome = asShortToken(props.outcome ?? undefined, 24) ?? 'unknown';

  trackEvent(AnalyticsEvents.RESEARCH_PERFORMED, {
    queryLength: queryLength != null && queryLength >= 0 ? queryLength : null,
    resultCount: resultCount != null && resultCount >= 0 ? resultCount : null,
    available: typeof props.available === 'boolean' ? props.available : null,
    outcome,
    source: asShortToken(props.source ?? 'research_sidebar', 40) ?? 'research_sidebar',
    provider: asShortToken(props.provider ?? undefined, 40) ?? null,
  });
};
