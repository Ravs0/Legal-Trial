import {
  extractJsonPayload,
  normalizeParsedSections,
  LexServiceError,
} from './lexideService';

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testExtractPrefersLeadingArray() {
  const raw = 'Here you go:\n```json\n[{"title":"Intro","content":"Hello world draft."}]\n```\n';
  const parsed = extractJsonPayload(raw);
  assert(Array.isArray(parsed), 'should parse array');
  const sections = normalizeParsedSections(parsed);
  assertEqual(sections.length, 1, 'one section');
  assertEqual(sections[0].title, 'Intro', 'title');
  assertEqual(sections[0].content, 'Hello world draft.', 'content');
}

function testExtractObjectWithSections() {
  const raw = '{"sections":[{"title":"Facts","content":"The plaintiff alleges breach."}]}';
  const sections = normalizeParsedSections(extractJsonPayload(raw));
  assertEqual(sections.length, 1, 'object.sections');
  assertEqual(sections[0].title, 'Facts', 'facts title');
}

function testDropsEmptyContentSections() {
  try {
    normalizeParsedSections([
      { title: 'Empty', content: '   ' },
      { title: 'Also empty', content: '' },
    ]);
    throw new Error('should have thrown');
  } catch (err) {
    assert(err instanceof Error, 'error type');
    assert((err as Error).message.includes('No sections'), 'empty sections message');
  }
}

function testAcceptsBodyAlias() {
  const sections = normalizeParsedSections([{ title: 'A', body: 'Body text preserved.' }]);
  assertEqual(sections[0].content, 'Body text preserved.', 'body alias');
}

function testLexServiceErrorName() {
  const err = new LexServiceError('parse failed');
  assertEqual(err.name, 'LexServiceError', 'name');
}

testExtractPrefersLeadingArray();
testExtractObjectWithSections();
testDropsEmptyContentSections();
testAcceptsBodyAlias();
testLexServiceErrorName();

console.log('lexideService tests passed');
