import {
  normalizeCaselawResponse,
  CaselawServiceError,
  type CaselawJurisdiction,
} from './caselawService';

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testNormalizesMalformedPayload() {
  const out = normalizeCaselawResponse(
    {
      results: [
        { title: '  Good Case  ', url: 'https://example.com/doc/1', snippet: 'Held that…' },
        { title: '', url: 'javascript:alert(1)', snippet: '' }, // dropped
        null,
        { title: 'No URL', url: 'not-a-url', snippet: 'still useful' },
      ],
      jurisdiction: 'indian',
      provider: 'indiankanoon-api',
      available: true,
    },
    'common',
  );

  assertEqual(out.results.length, 2, 'should keep only valid-ish rows');
  assertEqual(out.results[0].title, 'Good Case', 'title trimmed');
  assertEqual(out.results[0].url, 'https://example.com/doc/1', 'https url kept');
  assertEqual(out.results[1].url, '', 'unsafe/non-http url cleared');
  assertEqual(out.jurisdiction, 'indian', 'jurisdiction from payload');
  assertEqual(out.available, true, 'available flag');
  assertEqual(out.provider, 'indiankanoon-api', 'provider preserved');
}

function testEmptyResultsMessage() {
  const out = normalizeCaselawResponse(
    { results: [], available: true, jurisdiction: 'indian' },
    'indian',
  );
  assert(!!out.message && out.message.includes('No judgments'), 'empty available search needs message');
}

function testUnavailableDefaultMessage() {
  const indian = normalizeCaselawResponse({ available: false }, 'indian' as CaselawJurisdiction);
  assert(!!indian.message && indian.message.length > 0, 'unavailable indian needs message');

  const common = normalizeCaselawResponse({ available: false }, 'common');
  assert(!!common.message && common.message.toLowerCase().includes('common'), 'common-law unavailable copy');
}

function testNonObjectPayload() {
  const out = normalizeCaselawResponse('not-json', 'indian');
  assertEqual(out.results.length, 0, 'non-object yields empty results');
  assertEqual(out.jurisdiction, 'indian', 'fallback jurisdiction');
  assertEqual(out.available, false, 'non-object not available');
}

function testErrorClassName() {
  const err = new CaselawServiceError('boom');
  assertEqual(err.name, 'CaselawServiceError', 'error name');
  assertEqual(err.message, 'boom', 'error message');
}

testNormalizesMalformedPayload();
testEmptyResultsMessage();
testUnavailableDefaultMessage();
testNonObjectPayload();
testErrorClassName();

console.log('caselawService tests passed');
