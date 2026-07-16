import {
  ALLOWED_COURT_DATA_FILTERS,
  buildCourtDataResponse,
  CourtDataQueryError,
  detectQueryShape,
  extractCaseNumber,
  extractCnr,
  parseCourtDataQuery,
  prioritizeDocuments,
  scoreSourceRelevance,
  SOURCE_IDS,
  courtDataSources,
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
  assert(
    response.warnings.some((warning) => warning.includes('API Setu is an onboarding channel')),
    'missing API Setu credential warning when api_setu is in results',
  );
  // Default listing should keep SCI first (stable ranking).
  assertEqual(response.records[0].source, 'sci', 'default first source is SCI');
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

  const zero = parseCourtDataQuery({ limit: '0' });
  assertEqual(zero.limit, 1, 'zero limit floors to 1');

  const missing = parseCourtDataQuery({});
  assertEqual(missing.limit, 10, 'default limit');
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

function testInvalidLimitThrows() {
  try {
    parseCourtDataQuery({ limit: 'many' });
  } catch (error) {
    assert(error instanceof CourtDataQueryError, 'non-numeric limit should throw');
    assertIncludes(error.message, 'limit', 'limit error mentions field');
    return;
  }
  throw new Error('invalid limit did not throw');
}

function testImpossibleFilterComboReturnsEmptyWithWarning() {
  // SCI is supreme_court only — district filter + sci source → empty.
  const response = buildCourtDataResponse({ source: 'sci', courtLevel: 'district' });
  assertEqual(response.records.length, 0, 'impossible filter should yield zero records');
  assertEqual(response.sources.length, 0, 'impossible filter should yield zero sources');
  assert(
    response.warnings.some((w) => w.includes('No official sources matched')),
    'empty result should explain filter mismatch',
  );
}

function testQueryIsTrimmedAndBounded() {
  const long = 'x'.repeat(600);
  const parsed = parseCourtDataQuery({ q: `  ${long}  ` });
  assertEqual(parsed.q.length, 500, 'query should be capped at 500');
  assert(!parsed.q.startsWith(' '), 'query should be trimmed');
}

function testNullishRawDefaultsSafely() {
  const response = buildCourtDataResponse(undefined);
  assert(response.records.length >= 6, 'nullish raw should still list directory');
}

function testArrayRawThrows() {
  try {
    parseCourtDataQuery([] as unknown as Record<string, unknown>);
  } catch (error) {
    assert(error instanceof CourtDataQueryError, 'array payload should throw');
    return;
  }
  throw new Error('array payload did not throw');
}

function testCnrDetectionAndRanking() {
  const cnr = 'MHUP010012342020';
  assertEqual(extractCnr(cnr), 'MHUP010012342020', 'compact CNR');
  assertEqual(extractCnr('MHUP 01 001234 2020'), 'MHUP010012342020', 'spaced CNR');
  assertEqual(extractCnr('CNR: MHUP-01-001234-2020'), 'MHUP010012342020', 'hyphenated CNR');
  assertEqual(detectQueryShape(cnr), 'cnr', 'shape is cnr');

  const response = buildCourtDataResponse({ q: cnr });
  assert(response.records.length > 0, 'CNR query returns sources');
  assertEqual(response.records[0].source, 'ecourts_district', 'CNR prefers district eCourts');
  assertEqual(response.records[0].cnr, 'MHUP010012342020', 'CNR stamped on district record');
  assertEqual(response.records[0].data_type, 'case_status', 'CNR defaults data type to case_status');
  assert(
    response.warnings.some((w) => w.includes('CNR was detected')),
    'CNR compliance warning present',
  );
  assert(
    response.records[0].documents[0].title.toLowerCase().includes('cnr')
      || response.records[0].documents[0].title.toLowerCase().includes('case status'),
    'CNR query prioritizes case-status/CNR document link',
  );
}

function testCaseNumberDetection() {
  const q = 'SLP (C) 1234 of 2023';
  assertEqual(detectQueryShape(q), 'case_number', 'SLP shape');
  const extracted = extractCaseNumber(q);
  assert(!!extracted && extracted.includes('1234'), `case number extracted: ${extracted}`);

  const response = buildCourtDataResponse({ q });
  assertEqual(response.records[0].source, 'sci', 'case number prefers SCI');
  assert(response.records[0].case_number != null, 'case number stamped on SCI');
}

function testTextRankingPrefersJudgments() {
  const response = buildCourtDataResponse({ q: 'download judgment pdf neutral citation' });
  assert(response.records.length > 0, 'judgment text returns records');
  assertEqual(response.records[0].source, 'judgments_ecourts', 'judgment keywords rank judgments portal first');
}

function testPendencyRanksNjdg() {
  const response = buildCourtDataResponse({ q: 'district court pendency statistics dashboard' });
  assertEqual(response.records[0].source, 'njdg', 'pendency stats prefer NJDG');
}

function testDocumentPrioritizationByDataType() {
  const sci = courtDataSources.find((s) => s.id === 'sci');
  assert(!!sci, 'sci source exists');
  const ordered = prioritizeDocuments(sci!.documents, {
    q: '',
    dataType: 'cause_list',
    limit: 10,
  });
  assertIncludes(ordered[0].title.toLowerCase(), 'cause list', 'cause_list filter prioritizes cause list doc');
}

function testDeterministicRetrievedAt() {
  const fixed = new Date('2026-07-16T12:00:00.000Z');
  const response = buildCourtDataResponse({ source: 'njdg' }, fixed);
  assertEqual(
    response.records[0].provenance.retrieved_at,
    '2026-07-16T12:00:00.000Z',
    'injectable clock for provenance',
  );
}

function testAllowedFiltersExport() {
  assertEqual(ALLOWED_COURT_DATA_FILTERS.source.length, SOURCE_IDS.length, 'allowed source count');
  assertEqual(ALLOWED_COURT_DATA_FILTERS.limit.max, 25, 'allowed max limit');
}

function testWhitespaceCollapsedInQuery() {
  const parsed = parseCourtDataQuery({ q: '  constitutional   bench  ' });
  assertEqual(parsed.q, 'constitutional bench', 'internal whitespace collapsed');
}

function testScoreMonotonicForExactId() {
  const base = { q: 'njdg', limit: 10 } as const;
  const njdg = courtDataSources.find((s) => s.id === 'njdg')!;
  const sci = courtDataSources.find((s) => s.id === 'sci')!;
  assert(
    scoreSourceRelevance(njdg, { ...base }) > scoreSourceRelevance(sci, { ...base }),
    'token njdg scores NJDG above SCI',
  );
}

function testJudgmentDataTypeFilter() {
  const response = buildCourtDataResponse({ dataType: 'judgment' });
  assert(response.records.length >= 2, 'judgment filter returns multiple sources');
  assert(
    response.records.every((r) => r.data_type === 'judgment'),
    'all records stamped judgment',
  );
  assert(
    response.sources.every((s) => s.data_types.includes('judgment')),
    'only judgment-capable sources',
  );
}

testDefaultResponseReturnsOfficialSourceDirectory();
testSourceFilterReturnsSingleSource();
testCourtLevelAndDataTypeFilters();
testLimitIsClamped();
testInvalidFiltersThrowQueryError();
testInvalidLimitThrows();
testImpossibleFilterComboReturnsEmptyWithWarning();
testQueryIsTrimmedAndBounded();
testNullishRawDefaultsSafely();
testArrayRawThrows();
testCnrDetectionAndRanking();
testCaseNumberDetection();
testTextRankingPrefersJudgments();
testPendencyRanksNjdg();
testDocumentPrioritizationByDataType();
testDeterministicRetrievedAt();
testAllowedFiltersExport();
testWhitespaceCollapsedInQuery();
testScoreMonotonicForExactId();
testJudgmentDataTypeFilter();

console.log('courtDataGateway tests passed');
