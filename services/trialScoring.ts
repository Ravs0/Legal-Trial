import { ChatMessage, ObjectionDetails, TrialPhase, TrialScoreBreakdown } from '../types';

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
}

export const scoreSubmission = (
  previous: TrialScoreBreakdown,
  text: string,
  recentUserTexts: string[] = [],
): ScoreResult => {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const isSpam = trimmed.length < 40;
  const isDup = recentUserTexts.some(t => t.trim().toLowerCase() === lower);
  const citesLaw = /article|section|act|precedent|case|authority|treaty|convention|rule|statute|sc |scc|air |wlr/.test(lower);
  const appliesFacts = /because|therefore|on these facts|evidence|record|burden|relief|remedy|issue|plaintiff|defendant|petitioner|respondent/.test(lower);
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
    eng = 2;
    adv = 2 + (citesLaw ? 3 : 0) + (appliesFacts ? 3 : 0);
    resp = appliesFacts ? 3 : 1;
    prof = conciseEnough ? 1 : -1;
    if (citesLaw) reasons.push('cites law');
    if (appliesFacts) reasons.push('applies facts');
    if (conciseEnough) reasons.push('clear length');
    if (!citesLaw && !appliesFacts) reasons.push('thin legal grounding');
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
  };
};

export const inferNextPhase = (messages: ChatMessage[]): TrialPhase => {
  const substantiveUserTurns = messages.filter(msg => msg.sender === 'user' && msg.meta?.kind !== 'objection').length;
  if (substantiveUserTurns <= 1) return 'opening';
  if (substantiveUserTurns <= 3) return 'issue_framing';
  if (substantiveUserTurns <= 5) return 'rebuttal';
  if (substantiveUserTurns <= 7) return 'judicial_questions';
  return 'closing';
};

export const detectObjectionOutcome = (rulingText: string): ObjectionDetails['outcome'] => {
  const lower = rulingText.toLowerCase();
  if (lower.includes('sustained')) return 'sustained';
  if (lower.includes('overruled')) return 'overruled';
  return 'reserved';
};

export const phaseLabel = (phase: TrialPhase) => phase.replace(/_/g, ' ');
