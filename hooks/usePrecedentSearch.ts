import { useMemo } from 'react';
import { CaseDetail } from '../types';

export interface SearchResult {
  caseItem: CaseDetail;
  score: number;
  matchedTerms: string[];
}

export const usePrecedentSearch = (
  query: string,
  casesList: CaseDetail[],
  pipeline: 'bm25' | 'legal-bert' | 'haystack-hybrid' = 'legal-bert',
  weights = { semantic: 0.5, authority: 0.3, recency: 0.2 }
): SearchResult[] => {
  return useMemo(() => {
    // If no query, return empty list or all cases sorted by simulated authority
    if (!query || !query.trim()) {
      return casesList.map(c => {
        const auth = 50 + (c.title.charCodeAt(0) % 50);
        const year = 1880 + (c.title.charCodeAt(1 % c.title.length) % 145);
        const yearRatio = (year - 1880) / 145;
        const score = Math.round((auth / 100 * weights.authority + yearRatio * weights.recency) * 100);
        return { caseItem: c, score, matchedTerms: [] };
      }).sort((a, b) => b.score - a.score);
    }

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^\w]/g, ''))
      .filter(t => t.length > 2);

    const results: SearchResult[] = casesList.map(c => {
      let keywordScore = 0;
      const matchedTerms: string[] = [];

      const searchTargets = [
        { text: c.title.toLowerCase(), weight: 10 },
        { text: c.briefFacts.toLowerCase(), weight: 2 },
        { text: c.relevantArticlesSections.toLowerCase(), weight: 4 },
        { text: c.legalIssues.join(' ').toLowerCase(), weight: 3 }
      ];

      // Exact keyword matches
      terms.forEach(term => {
        let matched = false;
        searchTargets.forEach(target => {
          const regex = new RegExp(term, 'gi');
          const matches = target.text.match(regex);
          if (matches && matches.length > 0) {
            keywordScore += matches.length * target.weight;
            matched = true;
          }
        });
        if (matched) matchedTerms.push(term);
      });

      // Semantic synonym match simulation (Legal-BERT/Haystack)
      let semanticScore = 0;
      if (pipeline !== 'bm25') {
        const hasKeywordMatch = keywordScore > 0;
        
        // Simulating synonym matching: if they search copyright/IP, breach/contract, etc.
        const textLower = (c.title + ' ' + c.briefFacts + ' ' + c.relevantArticlesSections).toLowerCase();
        let synonymMatch = false;

        const synonyms = [
          { keys: ['copyright', 'trademark', 'patent', 'ipr', 'intellectual'], category: 'intellectual_property' },
          { keys: ['contract', 'breach', 'agreement', 'promise', 'covenant'], category: 'contracts' },
          { keys: ['negligence', 'tort', 'injury', 'accident', 'liability', 'damage'], category: 'torts' },
          { keys: ['constitution', 'fundamental', 'right', 'article', 'writ'], category: 'constitutional' }
        ];

        terms.forEach(term => {
          const matchedCategory = synonyms.find(s => s.keys.includes(term));
          if (matchedCategory) {
            // Check if case matches this synonym category
            const hasSynonymWord = matchedCategory.keys.some(k => textLower.includes(k));
            if (hasSynonymWord) {
              synonymMatch = true;
              if (!matchedTerms.includes(term)) {
                matchedTerms.push(term);
              }
            }
          }
        });

        // Calculate semantic baseline: if keyword match, high semantic; if synonym match, moderate semantic
        if (hasKeywordMatch) {
          semanticScore = 0.85 + (keywordScore % 15) / 100;
        } else if (synonymMatch) {
          semanticScore = 0.55 + (c.title.length % 15) / 100;
        }
      } else {
        // BM25 is keyword only
        semanticScore = Math.min(1.0, keywordScore / 30);
      }

      // Simulated case authority (50 to 100)
      const authority = 50 + (c.title.charCodeAt(0) % 50);

      // Simulated case year (1880 to 2025)
      const year = 1880 + (c.title.charCodeAt(Math.min(1, c.title.length - 1)) % 145);
      const yearRatio = (year - 1880) / 145;

      // Final weighted scoring combining Semantic, Authority, and Recency
      let finalScore = 0;
      if (pipeline === 'bm25') {
        // BM25 strictly weights keyword relevance
        finalScore = Math.round(semanticScore * 100);
      } else if (pipeline === 'legal-bert') {
        // Legal-BERT focuses heavily on semantic match and authority
        finalScore = Math.round((semanticScore * 0.7 + (authority / 100) * 0.3) * 100);
      } else {
        // Haystack Hybrid uses the custom slider weights
        const sumWeights = weights.semantic + weights.authority + weights.recency || 1.0;
        const normSemantic = weights.semantic / sumWeights;
        const normAuthority = weights.authority / sumWeights;
        const normRecency = weights.recency / sumWeights;
        
        finalScore = Math.round(
          (semanticScore * normSemantic +
           (authority / 100) * normAuthority +
           yearRatio * normRecency) * 100
        );
      }

      return { caseItem: c, score: finalScore, matchedTerms };
    });

    // Sort by score descending and return only those with matching terms or non-zero scores
    return results
      .filter(r => r.score > 0 || r.matchedTerms.length > 0)
      .sort((a, b) => b.score - a.score);
  }, [query, casesList, pipeline, weights]);
};

