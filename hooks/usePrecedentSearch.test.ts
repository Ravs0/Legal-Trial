// Pure ranking tests for usePrecedentSearch helpers.
// Run: npx tsx hooks/usePrecedentSearch.test.ts
import {
  countOccurrences,
  rankPrecedents,
  titleCodeAt,
  type SearchResult,
} from './usePrecedentSearch';
import type { CaseDetail } from '../types';
import { CaseCategoryId, CaseDifficulty } from '../types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makeCase(partial: Partial<CaseDetail> & { id: string; title: string }): CaseDetail {
  return {
    id: partial.id,
    title: partial.title,
    categoryId: partial.categoryId ?? CaseCategoryId.CONSTITUTIONAL,
    briefFacts: partial.briefFacts ?? '',
    legalIssues: partial.legalIssues ?? [],
    relevantArticlesSections: partial.relevantArticlesSections ?? '',
    precedentCases: partial.precedentCases ?? '',
    difficulty: partial.difficulty ?? CaseDifficulty.INTERMEDIATE,
  };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${(e as Error).message}`);
    failed++;
  }
}

test('titleCodeAt empty / short titles never NaN', () => {
  assert(titleCodeAt('', 0) === 0, 'empty → 0');
  assert(titleCodeAt('', 1) === 0, 'empty idx1 → 0');
  assert(titleCodeAt(null, 0) === 0, 'null → 0');
  assert(titleCodeAt('A', 1) === 'A'.charCodeAt(0), 'clamp short title');
  assert(Number.isFinite(titleCodeAt('Kesavananda', 1)), 'finite for normal');
});

test('countOccurrences basic', () => {
  assert(countOccurrences('a b a b a', 'a') === 3, 'three a');
  assert(countOccurrences('copyright law', 'copy') === 1, 'prefix once');
  assert(countOccurrences('', 'x') === 0, 'empty hay');
  assert(countOccurrences('hello', '') === 0, 'empty needle');
});

test('rankPrecedents guards null list / empty titles', () => {
  const empty = rankPrecedents('contract', null as unknown as CaseDetail[]);
  assert(Array.isArray(empty) && empty.length === 0, 'null list → []');

  const broken = makeCase({ id: '1', title: '' });
  (broken as { legalIssues?: unknown }).legalIssues = undefined;
  (broken as { briefFacts?: unknown }).briefFacts = undefined;
  const results = rankPrecedents('', [broken]);
  assert(results.length === 1, 'empty query still ranks');
  assert(Number.isFinite(results[0].score), 'score finite with empty title');
});

test('rankPrecedents filters zero-hit queries', () => {
  const cases = [
    makeCase({
      id: 'c1',
      title: 'State of Bihar v. XYZ',
      briefFacts: 'A constitutional writ petition under Article 32.',
      legalIssues: ['fundamental rights'],
      relevantArticlesSections: 'Article 32',
    }),
  ];
  const miss = rankPrecedents('quantum entanglement', cases, 'legal-bert');
  assert(miss.length === 0, 'unrelated query yields no hits');

  const hit = rankPrecedents('constitutional rights', cases, 'legal-bert');
  assert(hit.length === 1, 'synonym/keyword hit');
  assert(hit[0].matchedTerms.length > 0, 'matched terms recorded');
});

test('rankPrecedents bm25 keyword path', () => {
  const cases = [
    makeCase({
      id: 'c2',
      title: 'Copyright Board Appeal',
      briefFacts: 'Infringement of copyright in software.',
      legalIssues: ['copyright'],
    }),
  ];
  const hit = rankPrecedents('copyright software', cases, 'bm25');
  assert(hit.length === 1, 'bm25 hit');
  assert(hit[0].score > 0, 'positive score');
});

test('rankPrecedents bad pipeline/weights fall back safely', () => {
  const cases = [
    makeCase({
      id: 'c3',
      title: 'Contract Dispute',
      briefFacts: 'Breach of agreement.',
      legalIssues: ['breach'],
    }),
  ];
  const r = rankPrecedents('contract breach', cases, 'not-a-pipeline' as 'bm25', {
    semantic: Number.NaN,
    authority: -1,
    recency: undefined as unknown as number,
  });
  assert(r.length === 1, 'still ranks with bad inputs');
  assert(Number.isFinite(r[0].score), 'finite score');
});

test('rankPrecedents scores are ordered desc', () => {
  const cases = [
    makeCase({ id: 'weak', title: 'Unrelated Matter', briefFacts: 'tax' }),
    makeCase({
      id: 'strong',
      title: 'Negligence Tort Injury',
      briefFacts: 'Accident liability damage claim.',
      legalIssues: ['negligence', 'tort'],
    }),
  ];
  const r: SearchResult[] = rankPrecedents('negligence injury', cases, 'haystack-hybrid', {
    semantic: 0.5,
    authority: 0.3,
    recency: 0.2,
  });
  assert(r.length >= 1, 'at least one hit');
  for (let i = 1; i < r.length; i++) {
    assert(r[i - 1].score >= r[i].score, 'sorted desc');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
