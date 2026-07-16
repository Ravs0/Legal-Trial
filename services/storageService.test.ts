import assert from 'node:assert/strict';
import {
  clearActiveSession,
  clearPendingSettings,
  clearStoredLexForgeData,
  isValidSessionSettings,
  loadActiveSession,
  loadCompletedSessionById,
  loadCompletedSessions,
  loadLatestCompletedSession,
  loadPendingSettings,
  readGenericState,
  saveActiveSession,
  saveCompletedSession,
  saveGenericState,
  savePendingSettings,
  STORAGE_KEYS,
} from './storageService';
import { createSessionRecord } from './testFixtures';
import { CaseDifficulty, SessionType } from '../types';

const store = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};

(globalThis as any).window = {
  localStorage: localStorageMock,
};

function reset() {
  store.clear();
}

function testActiveSessionRoundTrip() {
  reset();
  const record = createSessionRecord();
  saveActiveSession(record);
  const loaded = loadActiveSession();
  assert.ok(loaded);
  assert.equal(loaded!.id, record.id);
  assert.ok(loaded!.startTime instanceof Date);
  assert.equal(loaded!.startTime.toISOString(), record.startTime.toISOString());
  assert.equal(loaded!.transcript.length, 3);
  assert.ok(loaded!.transcript[0].timestamp instanceof Date);
  clearActiveSession();
  assert.equal(loadActiveSession(), null);
}

function testCompletedSessionNoDoubleCorruptAndDedupe() {
  reset();
  const first = createSessionRecord({ id: 'session-a' });
  const second = createSessionRecord({ id: 'session-b' });
  saveCompletedSession(first);
  saveCompletedSession(second);
  // Re-save first — should move to front and not duplicate.
  saveCompletedSession(first);
  const sessions = loadCompletedSessions();
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, 'session-a');
  assert.equal(sessions[1].id, 'session-b');
  assert.ok(sessions[0].startTime instanceof Date);
  assert.equal(loadCompletedSessionById('session-b')?.id, 'session-b');
  assert.equal(loadCompletedSessionById('missing'), null);
}

function testVersionGuardRejectsWrongEnvelope() {
  reset();
  window.localStorage.setItem(
    'legal-trial.active-session',
    JSON.stringify({ version: 999, savedAt: new Date().toISOString(), payload: createSessionRecord() }),
  );
  assert.equal(loadActiveSession(), null);
}

function testCorruptJsonAndInvalidPayloadRejected() {
  reset();
  window.localStorage.setItem('legal-trial.active-session', 'not-json{{{');
  assert.equal(loadActiveSession(), null);

  window.localStorage.setItem(
    'legal-trial.active-session',
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), payload: { id: 'x' } }),
  );
  assert.equal(loadActiveSession(), null);

  window.localStorage.setItem(
    'legal-trial.completed-sessions',
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      payload: [{ id: 'bad' }, createSessionRecord({ id: 'good' })],
    }),
  );
  const sessions = loadCompletedSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'good');
}

function testPendingSettingsShapeValidation() {
  reset();
  const settings = createSessionRecord().settings;
  savePendingSettings(settings);
  const loaded = loadPendingSettings();
  assert.ok(loaded);
  assert.equal(loaded!.caseDetail.title, settings.caseDetail.title);

  // Corrupt payload rejected
  window.localStorage.setItem(
    'legal-trial.pending-settings',
    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), payload: { practiceMode: 'indian' } }),
  );
  assert.equal(loadPendingSettings(), null);

  // Invalid practiceMode rejected
  window.localStorage.setItem(
    'legal-trial.pending-settings',
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      payload: {
        ...settings,
        practiceMode: 'martian',
      },
    }),
  );
  assert.equal(loadPendingSettings(), null);

  clearPendingSettings();
  assert.equal(loadPendingSettings(), null);
}

function testGenericStateAndClearAll() {
  reset();
  saveGenericState(STORAGE_KEYS.bridgeMessages, [{ id: 1 }]);
  assert.deepEqual(readGenericState(STORAGE_KEYS.bridgeMessages), [{ id: 1 }]);
  saveActiveSession(createSessionRecord());
  clearStoredLexForgeData();
  assert.equal(loadActiveSession(), null);
  assert.equal(readGenericState(STORAGE_KEYS.bridgeMessages), null);
}

function testRefusesInvalidSave() {
  reset();
  saveActiveSession({ id: '' } as any);
  assert.equal(loadActiveSession(), null);
  saveCompletedSession({ id: 'no-settings' } as any);
  assert.equal(loadCompletedSessions().length, 0);
  savePendingSettings({
    sessionType: SessionType.QUICK,
    difficulty: CaseDifficulty.BEGINNER,
    practiceMode: 'indian',
  } as any);
  assert.equal(loadPendingSettings(), null);
}

function testLatestCompletedAndCap() {
  reset();
  assert.equal(loadLatestCompletedSession(), null);

  for (let i = 0; i < 15; i += 1) {
    saveCompletedSession(createSessionRecord({ id: `session-cap-${i}` }));
  }
  const sessions = loadCompletedSessions();
  // MAX_COMPLETED_SESSIONS = 12; newest first.
  assert.equal(sessions.length, 12);
  assert.equal(sessions[0].id, 'session-cap-14');
  assert.equal(sessions[11].id, 'session-cap-3');
  assert.equal(loadLatestCompletedSession()?.id, 'session-cap-14');
}

function testIsValidSessionSettingsExport() {
  const settings = createSessionRecord().settings;
  assert.equal(isValidSessionSettings(settings), true);
  assert.equal(isValidSessionSettings({ ...settings, practiceMode: 'martian' } as any), false);
  assert.equal(isValidSessionSettings(null), false);
  assert.equal(isValidSessionSettings({}), false);
}

function testQuotaRecoveryDropsNonCriticalKeys() {
  reset();
  // Seed non-critical keys that freeStorageSpace should drop.
  window.localStorage.setItem(STORAGE_KEYS.strategyChatHistories, 'bulky');
  window.localStorage.setItem(STORAGE_KEYS.personaMessages, 'bulky');
  window.localStorage.setItem('draft-save-demo', 'bulky');
  window.localStorage.setItem('lexforge.analytics-events', 'bulky');

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  let attempts = 0;
  window.localStorage.setItem = (key: string, value: string) => {
    // Fail first write of the active-session envelope to force freeStorageSpace + retry.
    if (key === 'legal-trial.active-session' && attempts === 0) {
      attempts += 1;
      const err = new Error('QuotaExceededError');
      (err as any).name = 'QuotaExceededError';
      throw err;
    }
    return originalSetItem(key, value);
  };

  try {
    saveActiveSession(createSessionRecord({ id: 'quota-session' }));
    assert.equal(loadActiveSession()?.id, 'quota-session');
    // Non-critical keys should have been cleared during recovery.
    assert.equal(window.localStorage.getItem(STORAGE_KEYS.strategyChatHistories), null);
    assert.equal(window.localStorage.getItem(STORAGE_KEYS.personaMessages), null);
    assert.equal(window.localStorage.getItem('draft-save-demo'), null);
    assert.equal(window.localStorage.getItem('lexforge.analytics-events'), null);
  } finally {
    window.localStorage.setItem = originalSetItem;
  }
}

testActiveSessionRoundTrip();
testCompletedSessionNoDoubleCorruptAndDedupe();
testVersionGuardRejectsWrongEnvelope();
testCorruptJsonAndInvalidPayloadRejected();
testPendingSettingsShapeValidation();
testGenericStateAndClearAll();
testRefusesInvalidSave();
testLatestCompletedAndCap();
testIsValidSessionSettingsExport();
testQuotaRecoveryDropsNonCriticalKeys();

console.log('storageService tests passed');
