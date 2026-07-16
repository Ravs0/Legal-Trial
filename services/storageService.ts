import { SessionRecord, SessionSettings } from '../types';

const STORAGE_VERSION = 1;
const ACTIVE_SESSION_KEY = 'legal-trial.active-session';
const COMPLETED_SESSION_KEY = 'legal-trial.completed-sessions';
const MAX_COMPLETED_SESSIONS = 12;

interface StoredEnvelope<T> {
  version: number;
  savedAt: string;
  payload: T;
}

/** Runtime check so Node tests can install a window mock before calling APIs. */
const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toValidDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

/** Normalize Date fields for storage. Replacer converts Dates to ISO strings. */
const serializeSessionRecord = (record: SessionRecord): SessionRecord => ({
  ...record,
  startTime: toValidDate(record.startTime) ?? new Date(0),
  endTime: record.endTime != null ? (toValidDate(record.endTime) ?? undefined) : undefined,
  transcript: Array.isArray(record.transcript)
    ? record.transcript.map(message => ({
        ...message,
        timestamp: toValidDate(message.timestamp) ?? new Date(0),
      }))
    : [],
});

const replacer = (_key: string, value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

const reviveSessionRecord = (record: SessionRecord): SessionRecord => ({
  ...record,
  startTime: toValidDate(record.startTime) ?? new Date(0),
  endTime: record.endTime != null ? (toValidDate(record.endTime) ?? undefined) : undefined,
  transcript: Array.isArray(record.transcript)
    ? record.transcript.map(message => ({
        ...message,
        timestamp: toValidDate(message.timestamp) ?? new Date(0),
      }))
    : [],
});

/** Runtime shape check so corrupt localStorage cannot crash PracticeArena. */
const isSessionRecordShape = (value: unknown): value is SessionRecord => {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || !value.id) return false;
  if (!isPlainObject(value.settings)) return false;
  const settings = value.settings;
  if (!isPlainObject(settings.caseDetail) || typeof settings.caseDetail.title !== 'string') return false;
  if (!isPlainObject(settings.judgePersonality) || typeof settings.judgePersonality.name !== 'string') return false;
  if (!isPlainObject(settings.opposingCounselPersonality) || typeof settings.opposingCounselPersonality.name !== 'string') {
    return false;
  }
  if (value.transcript != null && !Array.isArray(value.transcript)) return false;
  return true;
};

const isSessionSettingsShape = (value: unknown): value is SessionSettings => {
  if (!isPlainObject(value)) return false;
  if (
    !isPlainObject(value.caseDetail)
    || typeof value.caseDetail.id !== 'string'
    || !value.caseDetail.id
    || typeof value.caseDetail.title !== 'string'
    || !value.caseDetail.title
  ) {
    return false;
  }
  if (
    !isPlainObject(value.judgePersonality)
    || typeof value.judgePersonality.id !== 'string'
    || !value.judgePersonality.id
    || typeof value.judgePersonality.name !== 'string'
    || !value.judgePersonality.name
  ) {
    return false;
  }
  if (
    !isPlainObject(value.opposingCounselPersonality)
    || typeof value.opposingCounselPersonality.id !== 'string'
    || !value.opposingCounselPersonality.id
    || typeof value.opposingCounselPersonality.name !== 'string'
    || !value.opposingCounselPersonality.name
  ) {
    return false;
  }
  if (typeof value.sessionType !== 'string' || !value.sessionType) return false;
  if (typeof value.difficulty !== 'string' || !value.difficulty) return false;
  if (value.practiceMode !== 'indian' && value.practiceMode !== 'international') return false;
  return true;
};

/** Exported for Setup leave-safe restore guards. */
export const isValidSessionSettings = isSessionSettingsShape;

const safeRead = <T>(key: string): StoredEnvelope<T> | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[storageService] invalid JSON for key', key);
      return null;
    }
    if (!isPlainObject(parsed)) return null;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (!('payload' in parsed)) return null;
    return parsed as unknown as StoredEnvelope<T>;
  } catch {
    return null;
  }
};

/** Drop non-critical LexForge keys to free quota without touching completed sessions. */
const freeStorageSpace = (): void => {
  if (!isBrowser()) return;
  const dropExact = new Set([
    'legal-trial.strategy-chat-histories',
    'legal-trial.persona-messages',
    'legal-trial.bridge-messages',
    'legal-trial.pending-settings',
    'lexforge.analytics-events',
  ]);
  const dropPrefixes = ['draft-save-', 'draft-snapshots-', 'subject-'];
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter(
      Boolean,
    ) as string[];
    for (const key of keys) {
      if (key === ACTIVE_SESSION_KEY || key === COMPLETED_SESSION_KEY) continue;
      if (dropExact.has(key) || dropPrefixes.some(prefix => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* privacy mode / blocked storage */
  }
};

const safeWrite = <T>(key: string, payload: T): boolean => {
  if (!isBrowser()) return false;
  const envelope: StoredEnvelope<T> = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    payload,
  };
  const serialized = JSON.stringify(envelope, replacer);
  try {
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    // QuotaExceeded or private mode: free non-critical keys once, then soft-fail.
    // Never truncate COMPLETED_SESSION_KEY as a side effect of another write.
    console.warn('[storageService] write failed', key, error);
    try {
      freeStorageSpace();
      window.localStorage.setItem(key, serialized);
      return true;
    } catch {
      /* ignore secondary failure */
    }
    // Last resort for completed-session writes only: keep newest subset.
    if (key === COMPLETED_SESSION_KEY && Array.isArray(payload)) {
      try {
        const trimmed = (payload as unknown[]).slice(0, Math.max(1, Math.floor(MAX_COMPLETED_SESSIONS / 2)));
        const trimmedEnvelope: StoredEnvelope<unknown> = {
          version: STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          payload: trimmed,
        };
        window.localStorage.setItem(key, JSON.stringify(trimmedEnvelope, replacer));
        return true;
      } catch {
        /* give up */
      }
    }
    return false;
  }
};

export const saveActiveSession = (record: SessionRecord) => {
  if (!isSessionRecordShape(record)) {
    console.warn('[storageService] refused to save active session with invalid shape');
    return;
  }
  safeWrite(ACTIVE_SESSION_KEY, serializeSessionRecord(record));
};

export const loadActiveSession = (): SessionRecord | null => {
  const envelope = safeRead<SessionRecord>(ACTIVE_SESSION_KEY);
  if (!envelope || !isSessionRecordShape(envelope.payload)) return null;
  return reviveSessionRecord(envelope.payload);
};

export const clearActiveSession = () => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* noop */
  }
};

export const saveCompletedSession = (record: SessionRecord) => {
  if (!isSessionRecordShape(record)) {
    console.warn('[storageService] refused to save completed session with invalid shape');
    return;
  }

  // Read raw payload (do not revive) so we serialize once and avoid double Date conversion.
  const existingRaw = (() => {
    const env = safeRead<SessionRecord[]>(COMPLETED_SESSION_KEY);
    if (!env || !Array.isArray(env.payload)) return [] as SessionRecord[];
    return env.payload.filter(isSessionRecordShape);
  })();

  const next = [record, ...existingRaw.filter(session => session.id !== record.id)]
    .slice(0, MAX_COMPLETED_SESSIONS)
    .map(serializeSessionRecord);

  safeWrite(COMPLETED_SESSION_KEY, next);
};

export const loadCompletedSessions = (): SessionRecord[] => {
  const envelope = safeRead<SessionRecord[]>(COMPLETED_SESSION_KEY);
  if (!envelope || !Array.isArray(envelope.payload)) return [];
  return envelope.payload.filter(isSessionRecordShape).map(reviveSessionRecord);
};

export const loadCompletedSessionById = (sessionId?: string | null): SessionRecord | null => {
  if (!sessionId) return null;
  return loadCompletedSessions().find(session => session.id === sessionId) || null;
};

export const loadLatestCompletedSession = (): SessionRecord | null => {
  return loadCompletedSessions()[0] || null;
};

// ─── Generic envelope helpers for non-trial screen state ─────────────────────
// These re-use the same versioned‑envelope pattern as active/completed sessions
// so that cross‑screen (StrategyRoom, AIPersonas, ConversationBridge) state
// survives refresh.

export const STORAGE_KEYS = {
  strategyChatHistories: 'legal-trial.strategy-chat-histories',
  personaMessages: 'legal-trial.persona-messages',
  bridgeMessages: 'legal-trial.bridge-messages',
} as const;

/** Save any JSON‑serialisable payload under a key. */
export const saveGenericState = <T>(key: string, payload: T): void => {
  safeWrite(key, payload);
};

/** Read a previously saved payload, or null. */
export const readGenericState = <T>(key: string): T | null => {
  const envelope = safeRead<T>(key);
  return envelope?.payload ?? null;
};

// ─── Pending (pre‑arena) setup settings ──────────────────────────────────────
const PENDING_SETTINGS_KEY = 'legal-trial.pending-settings';

export const savePendingSettings = (settings: SessionSettings): void => {
  if (!isSessionSettingsShape(settings)) {
    console.warn('[storageService] refused to save pending settings with invalid shape');
    return;
  }
  safeWrite(PENDING_SETTINGS_KEY, {
    ...settings,
    caseDetail: settings.caseDetail,
    judgePersonality: settings.judgePersonality,
    opposingCounselPersonality: settings.opposingCounselPersonality,
  });
};

export const clearPendingSettings = (): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PENDING_SETTINGS_KEY);
  } catch {
    /* noop */
  }
};

export const loadPendingSettings = (): SessionSettings | null => {
  const envelope = safeRead<unknown>(PENDING_SETTINGS_KEY);
  if (!envelope) return null;
  if (!isSessionSettingsShape(envelope.payload)) {
    // Corrupt draft: drop so leave/restore never rehydrates bad shape.
    clearPendingSettings();
    return null;
  }
  return envelope.payload;
};

/** Remove all LexForge content and preferences kept in this browser. */
export const clearStoredLexForgeData = (): void => {
  if (!isBrowser()) return;
  const removablePrefixes = ['legal-trial.', 'lexforge.', 'lexide_', 'draft-save-', 'draft-snapshots-', 'subject-'];
  const removableExactKeys = new Set(['practiceMode', 'sidebarOpen', 'lexide_v1_session']);
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter(
      Boolean,
    ) as string[];
    keys.forEach(key => {
      if (removableExactKeys.has(key) || removablePrefixes.some(prefix => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    });
  } catch {
    // Browser privacy settings may prevent storage access; clearing is best-effort.
  }
};
