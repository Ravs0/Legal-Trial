import {
  buildCourtDataResponse,
  CourtDataQueryError,
  parseCourtDataQuery,
} from './courtDataGateway';

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function testDefaultResponseReturnsOfficialSourceDirectory() {
  const response = buildCourtDataResponse({});

  assert(response.records.length >= 6, `expected at least 6 official source records, got ${response.records.length}`);
  assert(response.sources.some((source) => source.id === 'sci'), 'missing Supreme Court source');
  assert(response.sources.some((source) => source.id === 'ecourts_district'), 'missing eCourts district source');
  assert(response.sources.some((source) => source.id === 'njdg'), 'missing NJDG source');
  assert(
    response.warnings.some((warning) => warning.includes('Portal-only sources')),
    'missing portal-only compliance warning',
  );
}

function testSourceFilterReturnsSingleSource() {
  const response = buildCourtDataResponse({ source: 'sci', q: 'constitutional bench' });

  assertEqual(response.records.length, 1, 'SCI filtered record count');
  assertEqual(response.records[0].source, 'sci', 'SCI filtered source id');
  assertIncludes(response.records[0].summary, 'constitutional bench', 'SCI summary includes query');
  assert(
    response.records[0].documents.some((document) => document.official_url.includes('sci.gov.in')),
    'SCI record should include official service URLs',
  );
}

function testCourtLevelAndDataTypeFilters() {
  const response = buildCourtDataResponse({ courtLevel: 'district', dataType: 'case_status' });

  assert(response.records.length > 0, 'district case-status filter should return records');
  assert(
    response.records.every((record) => record.court_level === 'district'),
    'district filter should only return district records',
  );
  assert(
    response.records.every((record) => record.data_type === 'case_status'),
    'case-status filter should stamp matching data type',
  );
}

function testLimitIsClamped() {
  const parsed = parseCourtDataQuery({ limit: '999' });

  assertEqual(parsed.limit, 25, 'maximum limit clamp');
}

function testInvalidFiltersThrowQueryError() {
  try {
    parseCourtDataQuery({ courtLevel: 'trial_by_combat' });
  } catch (error) {
    assert(error instanceof CourtDataQueryError, 'invalid court level should throw CourtDataQueryError');
    assertIncludes(error.message, 'courtLevel', 'invalid court level error message');
    return;
  }

  throw new Error('invalid court level did not throw');
}

testDefaultResponseReturnsOfficialSourceDirectory();
testSourceFilterReturnsSingleSource();
testCourtLevelAndDataTypeFilters();
testLimitIsClamped();
testInvalidFiltersThrowQueryError();

console.log('courtDataGateway tests passed');
