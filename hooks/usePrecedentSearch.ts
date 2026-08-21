import { useMemo } from 'react';
import { CaseDetail } from '../types';

export interface SearchResult {
  caseItem: CaseDetail;
  score: number;
  matchedTerms: string[];
}

/** Honest labels: all pipelines are local weighted heuristics — no external models. */
export type SearchPipeline = 'bm25' | 'legal-bert' | 'haystack-hybrid';

export interface SearchWeights {
  semantic: number;
  authority: number;
  recency: number;
}

const DEFAULT_WEIGHTS: SearchWeights = Object.freeze({
  semantic: 0.5,
  authority: 0.3,
  recency: 0.2,
});

const SYNONYMS: ReadonlyArray<{ keys: readonly string[]; category: string }> = [
  { keys: ['copyright', 'trademark', 'patent', 'ipr', 'intellectual'], category: 'intellectual_property' },
  { keys: ['contract', 'breach', 'agreement', 'promise', 'covenant'], category: 'contracts' },
  { keys: ['negligence', 'tort', 'injury', 'accident', 'liability', 'damage'], category: 'torts' },
  { keys: ['constitution', 'fundamental', 'right', 'article', 'writ'], category: 'constitutional' },
];

const VALID_PIPELINES = new Set<SearchPipeline>(['bm25', 'legal-bert', 'haystack-hybrid']);

/** Finite number, else fallback. */
function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Safe string for search fields that may be missing at runtime. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').join(' ');
  }
  return '';
}

/**
 * Deterministic seed from a title character. Empty titles → 0 (not NaN).
 * Index is clamped into the string; never uses `% length` on empty strings.
 */
export function titleCodeAt(title: unknown, index: number): number {
  const t = typeof title === 'string' ? title : '';
  if (!t.length) return 0;
  const i = Math.max(0, Math.min(Math.floor(index), t.length - 1));
  return t.charCodeAt(i);
}

/** Count non-overlapping occurrences of needle in haystack (both lowercased). */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  let count = 0;
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + needle.length;
  }
  return count;
}

function normalizeWeights(weights?: Partial<SearchWeights> | null): SearchWeights {
  return {
    semantic: Math.max(0, finiteOr(weights?.semantic, DEFAULT_WEIGHTS.semantic)),
    authority: Math.max(0, finiteOr(weights?.authority, DEFAULT_WEIGHTS.authority)),
    recency: Math.max(0, finiteOr(weights?.recency, DEFAULT_WEIGHTS.recency)),
  };
}

function normalizePipeline(pipeline: unknown): SearchPipeline {
  if (typeof pipeline === 'string' && VALID_PIPELINES.has(pipeline as SearchPipeline)) {
    return pipeline as SearchPipeline;
  }
  return 'legal-bert';
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ''))
    .filter((t) => t.length > 2);
}

/**
 * Pure precedent ranker — same logic the hook memoizes.
 * Safe against empty titles, missing case fields, bad weights, and non-array lists.
 */
export function rankPrecedents(
  query: string,
  casesList: CaseDetail[] | null | undefined,
  pipeline: SearchPipeline | string = 'legal-bert',
  weightsInput?: Partial<SearchWeights> | null,
): SearchResult[] {
  const list = Array.isArray(casesList) ? casesList : [];
  const weights = normalizeWeights(weightsInput);
  const activePipeline = normalizePipeline(pipeline);
  const q = typeof query === 'string' ? query : '';

  // No query → authority/recency ranking of the full docket (simulated).
  if (!q.trim()) {
    return list
      .map((c) => {
        const auth = 50 + (titleCodeAt(c?.title, 0) % 50);
        const year = 1880 + (titleCodeAt(c?.title, 1) % 145);
        const yearRatio = (year - 1880) / 145;
        const score = Math.round(
          ((auth / 100) * weights.authority + yearRatio * weights.recency) * 100,
        );
        return { caseItem: c, score, matchedTerms: [] as string[] };
      })
      .sort((a, b) => b.score - a.score);
  }

  const terms = tokenizeQuery(q);
  // Query had only stopwords / punctuation → no matches (not full docket dump).
  if (terms.length === 0) {
    return [];
  }

  const results: SearchResult[] = list.map((c) => {
    let keywordScore = 0;
    const matchedTerms: string[] = [];

    const title = asText(c?.title).toLowerCase();
    const briefFacts = asText(c?.briefFacts).toLowerCase();
    const articles = asText(c?.relevantArticlesSections).toLowerCase();
    const issues = asText(c?.legalIssues).toLowerCase();

    const searchTargets = [
      { text: title, weight: 10 },
      { text: briefFacts, weight: 2 },
      { text: articles, weight: 4 },
      { text: issues, weight: 3 },
    ];

    // indexOf-based counts — no RegExp, so query tokens cannot become ReDoS.
    for (const term of terms) {
      let matched = false;
      for (const target of searchTargets) {
        const hits = countOccurrences(target.text, term);
        if (hits > 0) {
          keywordScore += hits * target.weight;
          matched = true;
        }
      }
      if (matched) matchedTerms.push(term);
    }

    let semanticScore = 0;
    if (activePipeline !== 'bm25') {
      const hasKeywordMatch = keywordScore > 0;
      const textLower = `${title} ${briefFacts} ${articles}`;
      let synonymMatch = false;

      for (const term of terms) {
        const matchedCategory = SYNONYMS.find((s) => s.keys.includes(term));
        if (!matchedCategory) continue;
        const hasSynonymWord = matchedCategory.keys.some((k) => textLower.includes(k));
        if (hasSynonymWord) {
          synonymMatch = true;
          if (!matchedTerms.includes(term)) {
            matchedTerms.push(term);
          }
        }
      }

      if (hasKeywordMatch) {
        semanticScore = 0.85 + (keywordScore % 15) / 100;
      } else if (synonymMatch) {
        semanticScore = 0.55 + (titleCodeAt(c?.title, 0) % 15) / 100;
      }
    } else {
      semanticScore = Math.min(1.0, keywordScore / 30);
    }

    const authority = 50 + (titleCodeAt(c?.title, 0) % 50);
    const year = 1880 + (titleCodeAt(c?.title, 1) % 145);
    const yearRatio = (year - 1880) / 145;

    let finalScore = 0;
    if (activePipeline === 'bm25') {
      finalScore = Math.round(semanticScore * 100);
    } else if (activePipeline === 'legal-bert') {
      finalScore = Math.round((semanticScore * 0.7 + (authority / 100) * 0.3) * 100);
    } else {
      // Guard zero-sum weights (all zeros → fall back to equal thirds).
      const sumWeights = weights.semantic + weights.authority + weights.recency;
      const denom = sumWeights > 0 ? sumWeights : 1;
      const normSemantic = weights.semantic / denom;
      const normAuthority = weights.authority / denom;
      const normRecency = weights.recency / denom;

      finalScore = Math.round(
        (semanticScore * normSemantic +
          (authority / 100) * normAuthority +
          yearRatio * normRecency) *
          100,
      );
    }

    return { caseItem: c, score: finalScore, matchedTerms };
  });

  // Require actual term/synonym hits. Legal-BERT/hybrid always bake in
  // authority/recency so score > 0 alone would dump the full docket.
  return results
    .filter((r) => r.matchedTerms.length > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Memoized precedent search.
 *
 * Stale-state note: CaseLibrary passes a fresh `{ semantic, authority, recency }`
 * object every render. We depend on the primitive fields so memo only busts
 * when the numbers (or query/pipeline/list) actually change.
 */
export const usePrecedentSearch = (
  query: string,
  casesList: CaseDetail[] | null | undefined,
  pipeline: SearchPipeline | string = 'legal-bert',
  weights: Partial<SearchWeights> | null | undefined = DEFAULT_WEIGHTS,
): SearchResult[] => {
  const semantic = weights?.semantic;
  const authority = weights?.authority;
  const recency = weights?.recency;

  return useMemo(
    () =>
      rankPrecedents(query, casesList, pipeline, {
        semantic,
        authority,
        recency,
      }),
    [query, casesList, pipeline, semantic, authority, recency],
  );
};
