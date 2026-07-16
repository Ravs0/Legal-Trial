import {
  CASES,
  JUDGE_PERSONALITIES,
  OPPOSING_COUNSEL_PERSONALITIES,
} from '../constants';
import {
  CaseCategoryId,
  CaseDetail,
  CaseDifficulty,
  JudgePersonality,
  OpposingCounselPersonality,
  SessionSettings,
  SessionType,
} from '../types';

/**
 * Stable preferred demo case order (Indian catalog IDs).
 * Prefer approachable, modern-statute beginner briefs with named parties when present.
 * First match that still exists and scores well wins; otherwise quality ranking decides.
 */
export const PREFERRED_DEMO_CASE_IDS: readonly string[] = [
  'fam2', // Interim maintenance — accessible Indian family law, BNSS s.144 / Rajnesh v. Neha
  'ipr3', // Trade dress — clear named parties and commercial IP issues
];

/** Specialty keyword map for demo opposing counsel (aligned with Case Library). */
const COUNSEL_MATCH_TERMS: Partial<Record<CaseCategoryId, string[]>> = {
  [CaseCategoryId.CONSTITUTIONAL]: ['constitutional', 'human rights'],
  [CaseCategoryId.CRIMINAL]: ['criminal'],
  [CaseCategoryId.COMMERCIAL]: ['commercial', 'corporate', 'arbitration'],
  [CaseCategoryId.LABOR]: ['labor', 'employment'],
  [CaseCategoryId.FAMILY]: ['family', 'gender', 'women'],
  [CaseCategoryId.PROPERTY]: ['property', 'civil', 'commercial'],
  [CaseCategoryId.ENVIRONMENTAL_IN]: ['environmental', 'public interest'],
  [CaseCategoryId.IPR_IN]: ['ip', 'intellectual property', 'technology', 'trademark'],
};

/** Bench keyword map (matched against judge description + system instruction). */
const JUDGE_MATCH_TERMS: Partial<Record<CaseCategoryId, string[]>> = {
  [CaseCategoryId.CONSTITUTIONAL]: ['constitutional', 'fundamental rights', 'basic structure'],
  [CaseCategoryId.CRIMINAL]: ['criminal', 'due process', 'liberty', 'evidence'],
  [CaseCategoryId.COMMERCIAL]: ['commercial', 'contract', 'arbitration', 'corporate'],
  [CaseCategoryId.LABOR]: ['labor', 'employment', 'social justice', 'worker'],
  [CaseCategoryId.FAMILY]: ['family', 'gender', 'matrimonial', 'women', 'equality', 'maintenance'],
  [CaseCategoryId.PROPERTY]: ['property', 'civil', 'land'],
  [CaseCategoryId.ENVIRONMENTAL_IN]: ['environmental', 'public interest', 'ecology'],
  [CaseCategoryId.IPR_IN]: ['intellectual property', 'technology', 'patent', 'trademark', 'commercial'],
};

const DEMO_INCOMPLETE_ERROR =
  'Demo session cannot start because Indian practice data is incomplete.';

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const includesAny = (haystack: string, terms: string[]): boolean => {
  if (!terms.length || !haystack) return false;
  const lower = haystack.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
};

/**
 * Heuristic quality score for demo case selection.
 * Favors beginner dockets with dense briefs, named parties, issues, and statute/precedent anchors.
 */
export const scoreDemoCase = (caseDetail: CaseDetail): number => {
  let score = 0;
  const facts = caseDetail.briefFacts || '';
  const issues = Array.isArray(caseDetail.legalIssues) ? caseDetail.legalIssues : [];
  const statutes = caseDetail.relevantArticlesSections || '';
  const precedents = caseDetail.precedentCases || '';
  const title = caseDetail.title || '';

  if (caseDetail.difficulty === CaseDifficulty.BEGINNER) score += 40;
  else if (caseDetail.difficulty === CaseDifficulty.INTERMEDIATE) score += 10;

  // Dense brief (aim for training-ready fact matrix, not one-liners).
  score += Math.min(30, Math.floor(facts.trim().length / 20));
  score += Math.min(12, issues.filter((issue) => hasText(issue)).length * 3);

  if (/\bv\.?\b/i.test(title) || /\bv\.\s/i.test(facts)) score += 8; // named adversarial caption
  if (hasText(statutes)) score += 6;
  if (hasText(precedents)) score += 6;

  // Modern Indian practice signals for a credible first-run demo.
  if (/\bBNSS\b|\bBNS\b|Bharatiya Nagarik|Bharatiya Nyaya/i.test(`${statutes} ${facts}`)) score += 5;
  if (/\d{4}/.test(statutes) || /\d{4}/.test(precedents)) score += 2;

  // Preferred catalog IDs get a small stable boost (order in PREFERRED_DEMO_CASE_IDS).
  const preferredIndex = PREFERRED_DEMO_CASE_IDS.indexOf(caseDetail.id);
  if (preferredIndex >= 0) score += 15 - preferredIndex * 3;

  // Incomplete shells should never win.
  if (!hasText(title) || facts.trim().length < 80) score -= 50;
  if (issues.length === 0) score -= 20;

  return score;
};

export const selectDemoCase = (cases: CaseDetail[]): CaseDetail | null => {
  if (!Array.isArray(cases) || cases.length === 0) return null;

  const complete = cases.filter(
    (c) =>
      c &&
      hasText(c.id) &&
      hasText(c.title) &&
      hasText(c.briefFacts) &&
      Array.isArray(c.legalIssues) &&
      c.legalIssues.some(hasText),
  );
  if (complete.length === 0) return cases[0] || null;

  // Explicit preferred IDs that are still complete, ranked by quality among that set.
  const preferred = PREFERRED_DEMO_CASE_IDS.map((id) => complete.find((c) => c.id === id)).filter(
    (c): c is CaseDetail => Boolean(c),
  );
  if (preferred.length > 0) {
    return [...preferred].sort((a, b) => scoreDemoCase(b) - scoreDemoCase(a))[0];
  }

  // Otherwise best beginner, then best overall quality.
  const beginners = complete.filter((c) => c.difficulty === CaseDifficulty.BEGINNER);
  const pool = beginners.length > 0 ? beginners : complete;
  return [...pool].sort((a, b) => scoreDemoCase(b) - scoreDemoCase(a))[0];
};

export const selectDemoCounsel = (
  categoryId: CaseCategoryId | string,
  counsel: OpposingCounselPersonality[],
): OpposingCounselPersonality | null => {
  if (!Array.isArray(counsel) || counsel.length === 0) return null;
  const usable = counsel.filter((c) => c && hasText(c.name) && hasText(c.specialty));
  if (usable.length === 0) return counsel[0] || null;

  const terms = COUNSEL_MATCH_TERMS[categoryId as CaseCategoryId] || [];
  const matched = usable.find((candidate) => includesAny(candidate.specialty, terms));
  return matched || usable[0];
};

export const selectDemoJudge = (
  categoryId: CaseCategoryId | string,
  judges: JudgePersonality[],
): JudgePersonality | null => {
  if (!Array.isArray(judges) || judges.length === 0) return null;
  const usable = judges.filter((j) => j && hasText(j.name));
  if (usable.length === 0) return judges[0] || null;

  const terms = JUDGE_MATCH_TERMS[categoryId as CaseCategoryId] || [];
  if (!terms.length) return usable[0];

  let best: JudgePersonality | null = null;
  let bestHits = -1;
  for (const judge of usable) {
    const corpus = `${judge.description || ''} ${judge.systemInstruction || ''}`;
    const hits = terms.reduce((n, term) => (includesAny(corpus, [term]) ? n + 1 : n), 0);
    if (hits > bestHits) {
      bestHits = hits;
      best = judge;
    }
  }
  return bestHits > 0 && best ? best : usable[0];
};

/**
 * Builds a high-quality, deterministic beginner Indian demo session for Landing / Home CTAs.
 * Selects the densest preferred beginner case and category-matched bench + opposing counsel.
 * Throws if product data is incomplete so callers can show an honest error.
 */
export const createDemoSessionSettings = (): SessionSettings => {
  const cases = Array.isArray(CASES) ? CASES : [];
  const judges = Array.isArray(JUDGE_PERSONALITIES) ? JUDGE_PERSONALITIES : [];
  const counsel = Array.isArray(OPPOSING_COUNSEL_PERSONALITIES)
    ? OPPOSING_COUNSEL_PERSONALITIES
    : [];

  const demoCase = selectDemoCase(cases);
  const demoJudge = demoCase
    ? selectDemoJudge(demoCase.categoryId, judges)
    : judges[0] || null;
  const demoCounsel = demoCase
    ? selectDemoCounsel(demoCase.categoryId, counsel)
    : counsel[0] || null;

  if (!demoCase || !demoJudge || !demoCounsel) {
    throw new Error(DEMO_INCOMPLETE_ERROR);
  }

  if (!hasText(demoCase.title) || !hasText(demoJudge.name) || !hasText(demoCounsel.name)) {
    throw new Error(DEMO_INCOMPLETE_ERROR);
  }

  if (!hasText(demoCase.briefFacts) || !Array.isArray(demoCase.legalIssues) || demoCase.legalIssues.length === 0) {
    throw new Error(DEMO_INCOMPLETE_ERROR);
  }

  return {
    caseDetail: demoCase,
    judgePersonality: demoJudge,
    opposingCounselPersonality: demoCounsel,
    sessionType: SessionType.QUICK,
    difficulty: demoCase.difficulty,
    // Demo CTA is intentionally Indian-practice only (asserted by tests).
    practiceMode: 'indian',
  };
};
