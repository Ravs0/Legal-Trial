import { useMemo } from 'react';
import { CaseDetail } from '../types';

export interface SearchResult {
  caseItem: CaseDetail;
  score: number;
  matchedTerms: string[];
}

export const usePrecedentSearch = (query: string, casesList: CaseDetail[]): SearchResult[] => {
  return useMemo(() => {
    if (!query || !query.trim()) {
      return casesList.map(c => ({ caseItem: c, score: 0, matchedTerms: [] }));
    }

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^\w]/g, ''))
      .filter(t => t.length > 2); // Filter out tiny words like "the", "in", "of"

    if (terms.length === 0) {
      return casesList.map(c => ({ caseItem: c, score: 0, matchedTerms: [] }));
    }

    const results: SearchResult[] = casesList.map(c => {
      let score = 0;
      const matchedTerms: string[] = [];

      const searchTargets = [
        { text: c.title.toLowerCase(), weight: 10 },
        { text: c.briefFacts.toLowerCase(), weight: 2 },
        { text: c.relevantArticlesSections.toLowerCase(), weight: 4 },
        { text: c.legalIssues.join(' ').toLowerCase(), weight: 3 }
      ];

      terms.forEach(term => {
        let matched = false;
        searchTargets.forEach(target => {
          const regex = new RegExp(term, 'gi');
          const matches = target.text.match(regex);
          if (matches && matches.length > 0) {
            score += matches.length * target.weight;
            matched = true;
          }
        });
        if (matched) matchedTerms.push(term);
      });

      return { caseItem: c, score, matchedTerms };
    });

    // Sort by score descending and return only those with score > 0
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query, casesList]);
};

