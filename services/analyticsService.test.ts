import assert from 'node:assert/strict';
import {
  AnalyticsEvents,
  classifyDreadlerTurnError,
  cleanProperties,
  clearAnalyticsEvents,
  getRecentEvents,
  trackDemoTrialStarted,
  trackDreadlerTurnFailed,
  trackEvent,
  trackResearchSearch,
} from './analyticsService';

// Node has no window by default — install a minimal localStorage mock.
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

// import.meta.env may be undefined under tsx — trackEvent guards it.
clearAnalyticsEvents();

function testTrackAndReadRoundTrip() {
  clearAnalyticsEvents();
  trackEvent('landing_viewed', { source: 'test' });
  const events = getRecentEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'landing_viewed');
  assert.equal(events[0].properties.source, 'test');
  assert.ok(events[0].id.startsWith('event-'));
  assert.ok(typeof events[0].timestamp === 'string');
}

function testIgnoresEmptyEventNames() {
  clearAnalyticsEvents();
  trackEvent('  ');
  trackEvent('');
  assert.equal(getRecentEvents().length, 0);
}

function testCapsEventHistory() {
  clearAnalyticsEvents();
  for (let i = 0; i < 110; i += 1) {
    trackEvent('burst_event', { i });
  }
  const events = getRecentEvents();
  assert.equal(events.length, 100);
  assert.equal(events[0].properties.i, 10);
  assert.equal(events[99].properties.i, 109);
}

function testVersionEnvelopeAndLegacyMigration() {
  clearAnalyticsEvents();
  // Legacy bare-array format still reads.
  window.localStorage.setItem(
    'lexforge.analytics-events',
    JSON.stringify([
      { id: 'event-legacy', name: 'legacy_event', timestamp: '2026-01-01T00:00:00.000Z', properties: { ok: true } },
      { id: 123, name: 'bad' }, // invalid shape dropped
    ]),
  );
  const legacy = getRecentEvents();
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].name, 'legacy_event');

  trackEvent('after_migration');
  const raw = window.localStorage.getItem('lexforge.analytics-events');
  assert.ok(raw);
  const parsed = JSON.parse(raw!);
  assert.equal(parsed.version, 1);
  assert.ok(Array.isArray(parsed.events));
  assert.equal(parsed.events.length, 2);
}

function testCorruptJsonIsIgnored() {
  clearAnalyticsEvents();
  window.localStorage.setItem('lexforge.analytics-events', '{not-json');
  assert.deepEqual(getRecentEvents(), []);
}

function testTruncatesLongStringProperties() {
  clearAnalyticsEvents();
  trackEvent('long_prop', { label: 'x'.repeat(1000) });
  const events = getRecentEvents();
  assert.equal(events.length, 1);
  assert.equal(String(events[0].properties.label).length, 120);
}

function testDropsSensitiveFreeTextProperties() {
  clearAnalyticsEvents();
  trackEvent('unsafe_attempt', {
    query: 'client confidential matter about Acme v. State',
    user_input: 'full interrogation turn text',
    transcript: 'entire courtroom transcript',
    draft: 'full brief draft',
    message: 'raw server error body with secrets',
    mode: 'indian',
    resultCount: 3,
  });
  const props = getRecentEvents()[0].properties;
  assert.equal(props.query, undefined);
  assert.equal(props.user_input, undefined);
  assert.equal(props.transcript, undefined);
  assert.equal(props.draft, undefined);
  assert.equal(props.message, undefined);
  assert.equal(props.mode, 'indian');
  assert.equal(props.resultCount, 3);

  const cleaned = cleanProperties({
    search_query: 'still blocked',
    caseId: 'case-1',
  });
  assert.equal(cleaned.search_query, undefined);
  assert.equal(cleaned.caseId, 'case-1');
}

function testDemoTrialStartedHelper() {
  clearAnalyticsEvents();
  trackDemoTrialStarted({
    source: 'landing',
    mode: 'indian',
    caseId: 'beginner-bail-1',
    caseTitle: 'Demo Bail Application',
    replacedActiveSession: true,
  });
  const event = getRecentEvents()[0];
  assert.equal(event.name, AnalyticsEvents.DEMO_TRIAL_STARTED);
  assert.equal(event.properties.source, 'landing');
  assert.equal(event.properties.mode, 'indian');
  assert.equal(event.properties.caseId, 'beginner-bail-1');
  assert.equal(event.properties.caseTitle, 'Demo Bail Application');
  assert.equal(event.properties.replacedActiveSession, true);

  // Reject free-prose caseId (not a catalog id).
  clearAnalyticsEvents();
  trackDemoTrialStarted({
    source: 'dashboard',
    caseId: 'this is not an id because it has spaces and is long enough to look like prose',
  });
  assert.equal(getRecentEvents()[0].properties.caseId, null);
}

function testDreadlerTurnFailedHelper() {
  clearAnalyticsEvents();
  assert.equal(classifyDreadlerTurnError({ status: 503, serverError: 'DREADLER_STATE_SECRET missing' }), 'misconfigured');
  assert.equal(classifyDreadlerTurnError({ status: 429 }), 'rate_limit');
  assert.equal(classifyDreadlerTurnError({ status: 409, serverError: 'stale state token' }), 'stale_token');
  assert.equal(classifyDreadlerTurnError({ networkHint: true }), 'network');
  assert.equal(classifyDreadlerTurnError({ message: 'Dreadler returned an empty response.' }), 'empty_response');

  trackDreadlerTurnFailed({
    world: 'dreadler_logic',
    skin: 'dreadler',
    status: 503,
    turnCount: 4,
    errorClass: 'misconfigured',
  });
  const event = getRecentEvents()[0];
  assert.equal(event.name, AnalyticsEvents.DREADLER_TURN_FAILED);
  assert.equal(event.properties.world, 'dreadler_logic');
  assert.equal(event.properties.skin, 'dreadler');
  assert.equal(event.properties.status, 503);
  assert.equal(event.properties.errorClass, 'misconfigured');
  assert.equal(event.properties.turnCount, 4);
  // Ensure no free-text keys slipped in.
  assert.equal(event.properties.user_input, undefined);
  assert.equal(event.properties.error, undefined);
  assert.equal(event.properties.serverError, undefined);
}

function testResearchSearchHelperNeverStoresQuery() {
  clearAnalyticsEvents();
  trackResearchSearch({
    queryLength: 42,
    resultCount: 5,
    available: true,
    outcome: 'success',
    source: 'research_sidebar',
    provider: 'web',
  });
  const event = getRecentEvents()[0];
  assert.equal(event.name, AnalyticsEvents.RESEARCH_PERFORMED);
  assert.equal(event.properties.queryLength, 42);
  assert.equal(event.properties.resultCount, 5);
  assert.equal(event.properties.available, true);
  assert.equal(event.properties.outcome, 'success');
  assert.equal(event.properties.source, 'research_sidebar');
  assert.equal(event.properties.provider, 'web');
  assert.equal(event.properties.query, undefined);

  // Even if a caller mistakenly passes query via trackEvent, it is stripped.
  clearAnalyticsEvents();
  trackEvent(AnalyticsEvents.RESEARCH_PERFORMED, {
    query: 'secret client search',
    queryLength: 19,
  });
  assert.equal(getRecentEvents()[0].properties.query, undefined);
  assert.equal(getRecentEvents()[0].properties.queryLength, 19);
}

testTrackAndReadRoundTrip();
testIgnoresEmptyEventNames();
testCapsEventHistory();
testVersionEnvelopeAndLegacyMigration();
testCorruptJsonIsIgnored();
testTruncatesLongStringProperties();
testDropsSensitiveFreeTextProperties();
testDemoTrialStartedHelper();
testDreadlerTurnFailedHelper();
testResearchSearchHelperNeverStoresQuery();

console.log('analyticsService tests passed');
