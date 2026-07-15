import { ArgumentQuality, ChatMessage, ObjectionDetails, TrialPhase, TrialScoreBreakdown } from '../types';

export const DEFAULT_SCORE_BREAKDOWN: TrialScoreBreakdown = {
  engagement: 0,
  advocacy: 0,
  objections: 0,
  responsiveness: 0,
  professionalism: 25,
  total: 25,
};

const DIM_CAP = 50;

export const clampScoreTotal = (value: number) => Math.max(0, Math.min(200, Math.round(value)));
export const clampDim = (value: number) => Math.max(0, Math.min(DIM_CAP, Math.round(value)));

export const recalculateScore = (score: Omit<TrialScoreBreakdown, 'total'>): TrialScoreBreakdown => ({
  engagement: clampDim(score.engagement),
  advocacy: clampDim(score.advocacy),
  objections: clampDim(score.objections),
  responsiveness: clampDim(score.responsiveness),
  professionalism: clampDim(score.professionalism),
  total: clampScoreTotal(
    clampDim(score.engagement) + clampDim(score.advocacy) + clampDim(score.objections)
    + clampDim(score.responsiveness) + clampDim(score.professionalism),
  ),
});

export interface ScoreResult {
  score: TrialScoreBreakdown;
  scoreDelta: number;
  scoreReason: string;
  assessment: ArgumentQuality;
}

const sharedWordRatio = (left: string, right: string) => {
  const words = (value: string) => new Set((value.toLowerCase().match(/[a-z]{4,}/g) || []));
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach(word => { if (b.has(word)) overlap += 1; });
  return overlap / Math.min(a.size, b.size);
};

/**
 * A transparent, local assessment of advocacy structure. It does not pretend
 * to verify authorities; it tells the learner which link in the argument is
 * missing so the score cannot be inflated with legal-sounding keywords alone.
 */
export const assessArgument = (text: string, recentUserTexts: string[] = []): ArgumentQuality => {
  const lower = text.trim().toLowerCase();
  const issue = /\b(issue|whether|question before (?:the )?court|submit that|our case is)\b/.test(lower);
  const rule = /\b(article|section|act|rule|statute|precedent|case|authority|treaty|convention|scc|air|wlr)\b/.test(lower);
  const facts = /\b(record|evidence|fact|affidavit|testimony|document|email|notice|agreement|incident|here|this case)\b/.test(lower);
  const application = /\b(because|therefore|thus|accordingly|on these facts|applies|satisf(?:y|ies)|fails|shows|demonstrates|means that)\b/.test(lower);
  const remedy = /\b(relief|remedy|dismiss|allow|quash|set aside|declare|injunction|damages|bail|direction|order|prayer)\b/.test(lower);
  const respondsToOpponent = /\b(opposing counsel|respondent(?:'s)? argument|petitioner(?:'s)? argument|my learned friend|contrary|however|cannot stand)\b/.test(lower);
  const duplicate = recentUserTexts.some(previous => sharedWordRatio(text, previous) >= 0.86);
  const tooBrief = text.trim().length < 40;
  const tooLong = text.trim().length > 1_200;
  const score = Math.max(0, Math.min(10,
    (issue ? 1 : 0) + (rule ? 2 : 0) + (facts ? 2 : 0) + (application ? 3 : 0)
    + (remedy ? 1 : 0) + (respondsToOpponent ? 1 : 0) - (duplicate ? 4 : 0) - (tooBrief || tooLong ? 1 : 0),
  ));
  const nextStep = !issue
    ? 'State the precise issue you want the Court to decide.'
    : !rule
      ? 'Name the governing rule or authority, then verify it before relying on it.'
      : !facts
        ? 'Anchor the rule in a concrete fact from the record.'
        : !application
          ? 'Explain why that rule changes the result on these facts.'
          : !remedy
            ? 'End with the exact relief or direction you seek.'
            : respondsToOpponent
              ? 'Strong structure—anticipate the next factual or legal challenge.'
              : 'Address the strongest answer opposing counsel is likely to give.';

  return { score, issue, rule, facts, application, remedy, respondsToOpponent, nextStep };
};

export const scoreSubmission = (
  previous: TrialScoreBreakdown,
  text: string,
  recentUserTexts: string[] = [],
): ScoreResult => {
  const trimmed = text.trim();
  const isSpam = trimmed.length < 40;
  const assessment = assessArgument(trimmed, recentUserTexts);
  const isDup = recentUserTexts.some(previous => (
    previous.trim().toLowerCase() === trimmed.toLowerCase() || sharedWordRatio(trimmed, previous) >= 0.86
  ));
  const citesLaw = assessment.rule;
  const appliesFacts = assessment.facts && assessment.application;
  const conciseEnough = trimmed.length >= 80 && trimmed.length <= 1200;
  const reasons: string[] = [];

  let eng = 0;
  let adv = 0;
  let resp = 0;
  let prof = 0;

  if (isSpam) {
    reasons.push('too brief for credit');
  } else if (isDup) {
    reasons.push('repeats prior submission');
    eng = 0;
    adv = 1;
  } else {
    eng = assessment.score >= 3 ? 2 : 1;
    adv = Math.max(1, Math.round(assessment.score * 0.8));
    resp = (assessment.application ? 2 : 0) + (assessment.respondsToOpponent ? 2 : 0) + (assessment.remedy ? 1 : 0);
    prof = conciseEnough ? 1 : -1;
    if (citesLaw) reasons.push('cites law');
    if (appliesFacts) reasons.push('applies facts');
    if (conciseEnough) reasons.push('clear length');
    if (!citesLaw && !appliesFacts) reasons.push('thin legal grounding');
    reasons.push(assessment.nextStep);
  }

  const score = recalculateScore({
    engagement: previous.engagement + eng,
    advocacy: previous.advocacy + adv,
    objections: previous.objections,
    responsiveness: previous.responsiveness + resp,
    professionalism: previous.professionalism + prof,
  });

  return {
    score,
    scoreDelta: score.total - previous.total,
    scoreReason: reasons.length ? reasons.join('; ') : 'submission recorded',
    assessment,
  };
};

export const scoreObjection = (
  previous: TrialScoreBreakdown,
  outcome: ObjectionDetails['outcome'],
  wasQuick: boolean,
): ScoreResult => {
  const objectionDelta = outcome === 'sustained' ? 8 : outcome === 'overruled' ? -4 : 2;
  const engDelta = outcome === 'overruled' ? 0 : (wasQuick ? 2 : 1);
  const respDelta = outcome === 'overruled' ? 0 : 1;
  const profDelta = outcome === 'overruled' ? -2 : 1;
  const score = recalculateScore({
    engagement: previous.engagement + engDelta,
    advocacy: previous.advocacy,
    objections: previous.objections + objectionDelta,
    responsiveness: previous.responsiveness + respDelta,
    professionalism: previous.professionalism + profDelta,
  });

  const scoreReason = outcome === 'sustained'
    ? (wasQuick ? 'objection sustained (quick)' : 'objection sustained')
    : outcome === 'overruled'
      ? 'objection overruled'
      : 'objection reserved';

  return {
    score,
    scoreDelta: score.total - previous.total,
    scoreReason,
    assessment: {
      score: outcome === 'sustained' ? 8 : outcome === 'overruled' ? 3 : 5,
      issue: true,
      rule: outcome !== 'overruled',
      facts: true,
      application: outcome !== 'overruled',
      remedy: false,
      respondsToOpponent: true,
      nextStep: outcome === 'overruled' ? 'Refine the legal basis before raising the objection again.' : 'Carry the ruling into your next submission.',
    },
  };
};

export const inferNextPhase = (messages: ChatMessage[]): TrialPhase => {
  const substantive = messages.filter(msg => msg.sender === 'user' && msg.meta?.kind !== 'objection');
  const substantiveUserTurns = substantive.length;
  const averageQuality = substantive.length
    ? substantive.reduce((sum, message) => sum + (message.meta?.argumentQuality?.score ?? 5), 0) / substantive.length
    : 0;
  if (substantiveUserTurns <= 1) return 'opening';
  if (substantiveUserTurns <= 3 || averageQuality < 3.5) return 'issue_framing';
  if (substantiveUserTurns <= 5 || averageQuality < 4.5) return 'rebuttal';
  if (substantiveUserTurns <= 7 || averageQuality < 5) return 'judicial_questions';
  return 'closing';
};

export const detectObjectionOutcome = (rulingText: string): ObjectionDetails['outcome'] => {
  const lower = rulingText.toLowerCase();
  if (lower.includes('sustained')) return 'sustained';
  if (lower.includes('overruled')) return 'overruled';
  return 'reserved';
};

export const phaseLabel = (phase: TrialPhase) => phase.replace(/_/g, ' ');
