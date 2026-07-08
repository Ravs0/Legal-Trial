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

const isBrowser = typeof window !== 'undefined';

const serializeSessionRecord = (record: SessionRecord): SessionRecord => ({
  ...record,
  startTime: new Date(record.startTime),
  endTime: record.endTime ? new Date(record.endTime) : undefined,
  transcript: record.transcript.map(message => ({
    ...message,
    timestamp: new Date(message.timestamp),
  })),
});

const replacer = (_key: string, value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

const reviveSessionRecord = (record: SessionRecord): SessionRecord => ({
  ...record,
  startTime: new Date(record.startTime),
  endTime: record.endTime ? new Date(record.endTime) : undefined,
  transcript: Array.isArray(record.transcript)
    ? record.transcript.map(message => ({
        ...message,
        timestamp: new Date(message.timestamp),
      }))
    : [],
});

const safeRead = <T>(key: string): StoredEnvelope<T> | null => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEnvelope<T>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION || !('payload' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const safeWrite = <T>(key: string, payload: T) => {
  if (!isBrowser) return;
  const envelope: StoredEnvelope<T> = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    payload,
  };
  window.localStorage.setItem(key, JSON.stringify(envelope, replacer));
};

export const saveActiveSession = (record: SessionRecord) => {
  safeWrite(ACTIVE_SESSION_KEY, serializeSessionRecord(record));
};

export const loadActiveSession = (): SessionRecord | null => {
  const envelope = safeRead<SessionRecord>(ACTIVE_SESSION_KEY);
  return envelope ? reviveSessionRecord(envelope.payload) : null;
};

export const clearActiveSession = () => {
  if (!isBrowser) return;
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
};

export const saveCompletedSession = (record: SessionRecord) => {
  const sessions = loadCompletedSessions();
  const next = [reviveSessionRecord(record), ...sessions.filter(session => session.id !== record.id)].slice(0, MAX_COMPLETED_SESSIONS);
  safeWrite(COMPLETED_SESSION_KEY, next.map(serializeSessionRecord));
};

export const loadCompletedSessions = (): SessionRecord[] => {
  const envelope = safeRead<SessionRecord[]>(COMPLETED_SESSION_KEY);
  if (!envelope || !Array.isArray(envelope.payload)) return [];
  return envelope.payload.map(reviveSessionRecord);
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
  safeWrite(PENDING_SETTINGS_KEY, {
    ...settings,
    caseDetail: settings.caseDetail,
    judgePersonality: settings.judgePersonality,
    opposingCounselPersonality: settings.opposingCounselPersonality,
  });
};

export const loadPendingSettings = (): SessionSettings | null => {
  const envelope = safeRead<any>(PENDING_SETTINGS_KEY);
  return envelope?.payload ?? null;
};

export const clearPendingSettings = (): void => {
  if (!isBrowser) return;
  try { window.localStorage.removeItem(PENDING_SETTINGS_KEY); } catch { /* noop */ }
};
