import {
  AiServiceError,
  AI_CANCELLED_MESSAGE,
  AI_NETWORK_MESSAGE,
  buildLocalPerformanceMetrics,
  formatAiHttpError,
  isAiAbortError,
  normalizeAiFailure,
  requireDraftingAiText,
} from './aiService';
import type { SessionRecord } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => void, includes: string, label: string) {
  try {
    fn();
    throw new Error(`${label}: expected throw`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('expected throw')) throw err;
    if (!msg.includes(includes)) {
      throw new Error(`${label}: expected message to include ${JSON.stringify(includes)}, got ${JSON.stringify(msg)}`);
    }
  }
}

function testRequireDraftingAiText() {
  assert(requireDraftingAiText('  Party A sold widgets.  ', 'Fact generation') === 'Party A sold widgets.', 'trims usable text');
  assertThrows(() => requireDraftingAiText('', 'Fact generation'), 'empty response', 'empty text');
  assertThrows(() => requireDraftingAiText('Error: upstream timeout', 'Draft review'), 'upstream timeout', 'error prefix');
  assertThrows(() => requireDraftingAiText('error network failed', 'Filing guidance'), 'network failed', 'error space prefix');

  try {
    requireDraftingAiText('', 'Fact generation');
    throw new Error('expected empty code');
  } catch (err) {
    assert(err instanceof AiServiceError && err.code === 'empty', 'empty drafting text uses code empty');
  }
}

function testFormatAiHttpError() {
  assert(
    formatAiHttpError(404, undefined, true).includes('vercel dev'),
    'dev 404 points at vercel dev',
  );
  assert(
    !formatAiHttpError(404, undefined, false).includes('vercel dev'),
    'prod 404 is generic',
  );
  assert(formatAiHttpError(429).includes('busy'), '429 busy');
  assert(formatAiHttpError(503).includes('unavailable'), '503 unavailable');
  assert(formatAiHttpError(504).toLowerCase().includes('timed out'), '504 timeout');
  assert(formatAiHttpError(408).toLowerCase().includes('timed out'), '408 timeout');
  assert(formatAiHttpError(502).includes('could not respond'), '502 soft failure');
  assert(formatAiHttpError(500).includes('could not respond'), '500 soft failure');
  assert(
    formatAiHttpError(400, 'bad messages', true).includes('bad messages'),
    'dev 400 surfaces server detail',
  );
  assert(
    formatAiHttpError(400, 'bad messages', false).includes('400'),
    'prod 400 stays generic',
  );
}

function testIsAiAbortError() {
  assert(isAiAbortError(new DOMException('cancelled', 'AbortError')), 'DOMException AbortError');
  const named = new Error('aborted');
  named.name = 'AbortError';
  assert(isAiAbortError(named), 'Error name AbortError');
  assert(isAiAbortError(new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' })), 'AiServiceError aborted code');
  const ctl = new AbortController();
  ctl.abort();
  assert(isAiAbortError(new Error('unrelated'), ctl.signal), 'signal.aborted wins');
  assert(!isAiAbortError(new Error('Failed to fetch')), 'network is not abort');
  assert(!isAiAbortError(null), 'null is not abort');
}

function testNormalizeAiFailure() {
  const aborted = normalizeAiFailure(new DOMException('x', 'AbortError'));
  assert(aborted instanceof AiServiceError && aborted.code === 'aborted', 'abort → aborted code');
  assert(aborted.message === AI_CANCELLED_MESSAGE, 'abort uses stable cancel copy');

  const network = normalizeAiFailure(new TypeError('Failed to fetch'));
  assert(network.code === 'network', 'Failed to fetch → network');
  assert(network.message === AI_NETWORK_MESSAGE, 'network uses stable copy');

  const loadFailed = normalizeAiFailure(new TypeError('Load failed'));
  assert(loadFailed.code === 'network', 'Safari Load failed → network');

  const http = new AiServiceError(formatAiHttpError(429), { code: 'http', status: 429 });
  assert(normalizeAiFailure(http) === http, 'AiServiceError passthrough by identity');

  const ctl = new AbortController();
  ctl.abort();
  const raced = normalizeAiFailure(new TypeError('Failed to fetch'), ctl.signal);
  assert(raced.code === 'aborted', 'aborted signal beats network classification');

  const plain = normalizeAiFailure(new Error('  stream broke  '));
  assert(plain.code === 'unknown' && plain.message === 'stream broke', 'plain Error keeps trimmed message');
}

const record = {
  id: 'local-coaching-test',
  settings: {},
  startTime: new Date(),
  transcript: [
    {
      id: 'argument-1',
      sender: 'user',
      text: 'The issue is whether the notice denied a hearing. Under Article 21, the record shows no hearing was offered; therefore the order fails. We seek an order setting it aside.',
      timestamp: new Date(),
      meta: {
        kind: 'argument',
        argumentQuality: { score: 9, issue: true, rule: true, facts: true, application: true, remedy: true, respondsToOpponent: false, nextStep: 'Address the opposing argument.' },
      },
    },
    {
      id: 'objection-1',
      sender: 'user',
      text: '[OBJECTION] relevance',
      timestamp: new Date(),
      meta: { kind: 'objection', objection: { grounds: 'Relevance', basis: 'Irrelevant', outcome: 'sustained' } },
    },
  ],
} as unknown as SessionRecord;

testRequireDraftingAiText();
testFormatAiHttpError();
testIsAiAbortError();
testNormalizeAiFailure();

const metrics = buildLocalPerformanceMetrics(record);
assert(metrics.argumentStrength >= 8, `expected strong argument score, got ${metrics.argumentStrength}`);
assert(metrics.objectionHandling >= 7, `expected sustained objection credit, got ${metrics.objectionHandling}`);
assert(metrics.feedback.startsWith('Local coaching summary:'), 'fallback must identify itself as local coaching');
assert(metrics.improvementAreas.length > 0, 'fallback should provide a next action');

console.log('aiService tests passed');
