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
const DUP_RATIO = 0.72;
const NEAR_DUP_BIGRAM = 0.55;

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

/** Dimension labels used in feedback (UI-safe: no em dashes). */
export const SCORE_DIMENSION_LABELS = {
  engagement: 'Engagement',
  advocacy: 'Advocacy',
  objections: 'Objections',
  responsiveness: 'Responsiveness',
  professionalism: 'Professionalism',
} as const;

const tokenizeWords = (value: string): string[] =>
  (value.toLowerCase().match(/[a-z]{3,}/g) || []);

const sharedWordRatio = (left: string, right: string) => {
  const words = (value: string) => new Set(tokenizeWords(value).filter(w => w.length >= 4));
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach(word => { if (b.has(word)) overlap += 1; });
  return overlap / Math.min(a.size, b.size);
};

const bigrams = (value: string): Set<string> => {
  const tokens = tokenizeWords(value);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
};

const sharedBigramRatio = (left: string, right: string) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach(bg => { if (b.has(bg)) overlap += 1; });
  return overlap / Math.min(a.size, b.size);
};

const isNearDuplicate = (text: string, previous: string): boolean => {
  const exact = previous.trim().toLowerCase() === text.trim().toLowerCase();
  if (exact) return true;
  const lengthRatio = Math.min(text.length, previous.length) / Math.max(text.length, previous.length || 1);
  if (lengthRatio < 0.55) return false;
  return sharedWordRatio(text, previous) >= DUP_RATIO
    || sharedBigramRatio(text, previous) >= NEAR_DUP_BIGRAM;
};

/**
 * Returns true when a keyword match sits inside a clear negation/hedge window
 * so empty disclaimers like "no statute applies" do not earn structure credit.
 */
const isNegatedAround = (text: string, matchIndex: number, matchLength: number): boolean => {
  const start = Math.max(0, matchIndex - 42);
  const window = text.slice(start, matchIndex + matchLength);
  return /\b(no|not|never|neither|nor|without|lacks?|fail(?:s|ed|ing)?\s+to|cannot|can't|does\s+not|do\s+not|did\s+not|none|absent|unrelated|irrelevant)\b/i.test(window);
};

const findPositiveSignal = (text: string, pattern: RegExp): boolean => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    if (!isNegatedAround(text, match.index, match[0].length)) return true;
    if (match[0].length === 0) global.lastIndex += 1;
  }
  return false;
};

/** Citation / authority co-occurrence: bare "case" or "section" alone is not enough. */
const hasConcreteAuthority = (lower: string): boolean => {
  const citationShape =
    /\b(article|section|s\.|sec\.|rule|u\/s|under\s+s\.?)\s*\d+[a-z]?\b/i.test(lower)
    || /\b(art\.?)\s*\d+[a-z]?\b/i.test(lower)
    || /\b[a-z][a-z.'-]{1,40}\s+v\.?\s+[a-z][a-z.'-]{1,40}\b/i.test(lower)
    || /\b(scc|air|wlr|scr|all\s*er|us\s+\d+|f\.\s*2d|f\.\s*3d)\b/i.test(lower)
    || /§\s*\d+/.test(lower)
    || /\b(constitution|ipc|crpc|cpc|evidence\s+act|contract\s+act|companies\s+act|icj|icc|echr|uncitral)\b/i.test(lower);
  if (!citationShape) return false;
  // Require at least one non-negated authority token.
  return findPositiveSignal(lower, /\b(article|section|statute|precedent|authority|treaty|convention|constitution|act|rule|scc|air|wlr|§)\b/i)
    || findPositiveSignal(lower, /\bv\.?\s+[a-z]/i);
};

const hasConcreteFactAnchor = (lower: string): boolean => {
  const anchor =
    /\b(record|evidence|affidavit|testimony|exhibit|document|email|notice|agreement|contract|incident|transcript|pleading|petition|complaint|order\s+dated|dated\s+\d|paragraph\s+\d|para\.?\s*\d|page\s+\d)\b/i.test(lower)
    || /\b(on\s+\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/i.test(lower);
  if (!anchor) return false;
  return findPositiveSignal(lower, /\b(record|evidence|affidavit|testimony|exhibit|document|email|notice|agreement|contract|incident|transcript|pleading|petition|complaint|paragraph|para)\b/i)
    || /\b(dated|page|paragraph|para\.?)\s*\d/i.test(lower);
};

const IRAC_SIGNAL_LEXICON = new Set([
  'issue', 'whether', 'question', 'court', 'submit', 'case', 'article', 'section',
  'act', 'rule', 'statute', 'precedent', 'authority', 'record', 'evidence', 'fact',
  'affidavit', 'testimony', 'document', 'because', 'therefore', 'thus', 'accordingly',
  'applies', 'fails', 'shows', 'demonstrates', 'relief', 'remedy', 'dismiss', 'allow',
  'order', 'however', 'contrary', 'opposing', 'counsel', 'respondent', 'petitioner',
]);

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'this', 'these', 'those', 'with', 'from', 'into', 'for',
  'under', 'over', 'than', 'then', 'also', 'only', 'very', 'just', 'been', 'were',
  'was', 'are', 'has', 'have', 'had', 'not', 'but', 'our', 'out', 'any', 'all',
  'can', 'may', 'must', 'shall', 'will', 'its', 'his', 'her', 'who', 'whom',
]);

const isContentToken = (token: string) =>
  !IRAC_SIGNAL_LEXICON.has(token) && !STOP_WORDS.has(token);

const hasApplicationLogic = (lower: string): boolean => {
  const connector = findPositiveSignal(
    lower,
    /\b(because|therefore|thus|accordingly|consequently|on these facts|applies|satisf(?:y|ies)|fails|shows|demonstrates|means that|leads to|follows that|so that|with the result that)\b/i,
  );
  if (!connector) return false;
  // Require a fact or rule token nearby so "therefore relief" alone does not score.
  const hasSubstance =
    hasConcreteAuthority(lower)
    || hasConcreteFactAnchor(lower)
    || findPositiveSignal(lower, /\b(burden|test|standard|requirement|element|threshold|principles?)\b/i);
  if (!hasSubstance) return false;
  // Keyword salad: connector + anchor words but almost no independent content.
  const tokens = tokenizeWords(lower);
  const contentWords = tokens.filter(isContentToken);
  if (tokens.length <= 16 && contentWords.length < 2) return false;
  return true;
};

const hasIssueFraming = (lower: string): boolean =>
  findPositiveSignal(lower, /\b(issue|whether|question before (?:the )?court|submit that|our case is|the court must decide|the dispute is)\b/i);

const hasRemedy = (lower: string): boolean =>
  findPositiveSignal(lower, /\b(relief|remedy|dismiss|allow|quash|set aside|declare|injunction|damages|bail|direction|order|prayer|we\s+seek|pray\s+that|grant|refuse|uphold|reverse)\b/i);

const hasOpponentResponse = (lower: string): boolean => {
  // Cheap "however" alone is not enough; require an opposing-position marker.
  const strong = findPositiveSignal(
    lower,
    /\b(opposing counsel|respondent(?:'s)?(?:\s+argument)?|petitioner(?:'s)?(?:\s+argument)?|my learned friend|learned friend|the other side|contrary to|cannot stand|with respect,?\s+(?:that|the)|their (?:case|submission|argument)|answer(?:s|ing)? (?:that|this|the) (?:point|submission|argument))\b/i,
  );
  if (strong) return true;
  const hedgePlusTarget =
    /\b(however|nevertheless|nonetheless|even so)\b/i.test(lower)
    && /\b(argument|submission|claim|contention|position|case for|suggestion that)\b/i.test(lower);
  return hedgePlusTarget && !isNegatedAround(lower, lower.search(/\b(however|nevertheless|nonetheless|even so)\b/i), 8);
};

const courtroomIncivility = (lower: string): boolean =>
  /\b(idiot|stupid|liar|shut up|nonsense|rubbish counsel|you are wrong you fool|damn|bloody fool)\b/i.test(lower);

const typeTokenRatio = (text: string): number => {
  const tokens = tokenizeWords(text);
  if (tokens.length < 8) return 1;
  return new Set(tokens).size / tokens.length;
};

/**
 * Detects IRAC template stuffing: many signal keywords, little unique vocabulary,
 * or almost no content outside the signal lexicon.
 * Concrete authority+fact anchors with a few content words are allowed (short but real advocacy).
 */
const isTemplateThin = (
  text: string,
  signalsHit: number,
  hasAnchors: boolean,
): boolean => {
  const tokens = tokenizeWords(text);
  if (tokens.length < 8) return false;
  const contentTokens = tokens.filter(isContentToken);
  const signalCount = tokens.filter(t => IRAC_SIGNAL_LEXICON.has(t)).length;
  const signalShare = signalCount / tokens.length;
  const contentShare = contentTokens.length / tokens.length;
  const contentTtr = contentTokens.length
    ? new Set(contentTokens).size / contentTokens.length
    : 0;

  // Pure keyword salad with almost no independent nouns/verbs.
  if (signalsHit >= 3 && contentTokens.length <= 2 && tokens.length <= 28) return true;
  if (signalsHit >= 5 && contentTokens.length <= 3) return true;

  // Anchored short submissions (e.g. Section + record + breach) are not templates.
  if (hasAnchors && contentTokens.length >= 3) {
    return contentTtr < 0.35 && contentTokens.length < 8 && signalShare > 0.55;
  }

  if (signalsHit >= 4 && signalShare >= 0.5 && contentShare < 0.25 && tokens.length < 55) return true;
  if (signalsHit >= 4 && contentTokens.length >= 4 && contentTtr < 0.35) return true;
  return false;
};

/**
 * A transparent, local assessment of advocacy structure. It does not pretend
 * to verify authorities; it tells the learner which link in the argument is
 * missing so the score cannot be inflated with legal-sounding keywords alone.
 */
export const assessArgument = (text: string, recentUserTexts: string[] = []): ArgumentQuality => {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const issue = hasIssueFraming(lower);
  const rule = hasConcreteAuthority(lower);
  const facts = hasConcreteFactAnchor(lower);
  const application = hasApplicationLogic(lower);
  const remedy = hasRemedy(lower);
  const respondsToOpponent = hasOpponentResponse(lower);

  const signalsHit = [issue, rule, facts, application, remedy, respondsToOpponent].filter(Boolean).length;
  const duplicate = recentUserTexts.some(previous => isNearDuplicate(trimmed, previous));
  const tooBrief = trimmed.length < 40;
  const tooLong = trimmed.length > 1_200;
  const thinTemplate = !duplicate && isTemplateThin(trimmed, signalsHit, rule && facts);
  const lowDiversity = typeTokenRatio(trimmed) < 0.38 && tokenizeWords(trimmed).length >= 20;

  let score = (issue ? 1 : 0)
    + (rule ? 2 : 0)
    + (facts ? 2 : 0)
    + (application ? 3 : 0)
    + (remedy ? 1 : 0)
    + (respondsToOpponent ? 1 : 0)
    - (duplicate ? 4 : 0)
    - (tooBrief || tooLong ? 1 : 0)
    - (thinTemplate ? 3 : 0)
    - (lowDiversity && !thinTemplate ? 1 : 0);

  // Incomplete chain: rule without application, or facts without application, is weaker advocacy.
  if (rule && facts && !application) score -= 1;
  if ((rule || facts) && !application && !remedy) score -= 1;

  score = Math.max(0, Math.min(10, score));

  const nextStep = thinTemplate
    ? 'Replace keyword templates with a concrete authority, a record fact, and one line of application.'
    : duplicate
      ? 'Advance the argument: new authority, new fact, or a direct answer to the last challenge.'
      : !issue
        ? 'State the precise issue you want the Court to decide.'
        : !rule
          ? 'Name a concrete authority (Article, Section, or case name), then verify it before relying on it.'
          : !facts
            ? 'Anchor the rule in a concrete fact from the record (exhibit, notice, testimony, or dated order).'
            : !application
              ? 'Explain why that rule changes the result on these facts (because / therefore / applies).'
              : !remedy
                ? 'End with the exact relief or direction you seek.'
                : respondsToOpponent
                  ? 'Strong structure. Anticipate the next factual or legal challenge.'
                  : 'Address the strongest answer opposing counsel is likely to give, not only your theory.';

  return {
    score,
    issue,
    rule,
    facts,
    application,
    remedy,
    respondsToOpponent,
    nextStep,
    templateThin: thinTemplate || undefined,
  };
};

const professionalismDelta = (text: string, assessment: ArgumentQuality): number => {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const conciseEnough = trimmed.length >= 80 && trimmed.length <= 1200;
  const civil = !courtroomIncivility(lower);
  const structured = assessment.score >= 4;
  const onTopic = assessment.issue || assessment.rule || assessment.facts || assessment.remedy;
  let delta = 0;
  if (conciseEnough) delta += 1;
  else if (trimmed.length < 40 || trimmed.length > 1600) delta -= 1;
  if (!civil) delta -= 3;
  if (structured && onTopic) delta += 1;
  if (!onTopic && trimmed.length >= 80) delta -= 1;
  return Math.max(-3, Math.min(2, delta));
};

export const scoreSubmission = (
  previous: TrialScoreBreakdown,
  text: string,
  recentUserTexts: string[] = [],
): ScoreResult => {
  const trimmed = text.trim();
  const isSpam = trimmed.length < 40;
  const assessment = assessArgument(trimmed, recentUserTexts);
  const isDup = recentUserTexts.some(previousText => isNearDuplicate(trimmed, previousText));
  const citesLaw = assessment.rule;
  const appliesFacts = assessment.facts && assessment.application;
  const chainComplete = assessment.issue && assessment.rule && assessment.facts && assessment.application;
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
    adv = 0;
    resp = 0;
    prof = -1;
  } else if (assessment.templateThin) {
    reasons.push('keyword template, low advocacy credit');
    eng = 0;
    adv = Math.min(1, assessment.score > 0 ? 1 : 0);
    resp = 0;
    prof = Math.min(0, professionalismDelta(trimmed, assessment));
    reasons.push(assessment.nextStep);
  } else if (assessment.score <= 2 && !citesLaw && !appliesFacts) {
    reasons.push('thin legal grounding');
    eng = 1;
    adv = 0;
    resp = 0;
    prof = professionalismDelta(trimmed, assessment);
    if (prof < 0) reasons.push('decorum or focus needs work');
    reasons.push(assessment.nextStep);
  } else {
    // Engagement rewards showing up with real structure, not keyword volume.
    eng = assessment.score >= 6 ? 2 : assessment.score >= 3 ? 1 : 0;
    // Advocacy scales with structural score but caps low when application is missing.
    adv = Math.max(0, Math.round(assessment.score * 0.7));
    if (!assessment.application) adv = Math.min(adv, 2);
    if (assessment.score <= 3) adv = Math.min(adv, 1);
    // Rule without a concrete citation shape already fails assessArgument; still
    // hold back advocacy when the chain is incomplete.
    if (!chainComplete) adv = Math.min(adv, 4);

    resp = 0;
    if (assessment.application) resp += 2;
    if (assessment.respondsToOpponent) resp += 2;
    if (assessment.remedy) resp += 1;
    if (!assessment.respondsToOpponent && assessment.score >= 5) {
      // Strong monologue without engaging the other side: limited responsiveness credit.
      resp = Math.min(resp, 2);
    }
    if (!citesLaw) resp = Math.min(resp, 3);

    prof = professionalismDelta(trimmed, assessment);

    if (citesLaw) reasons.push('cites law');
    if (appliesFacts) reasons.push('applies facts');
    if (chainComplete) reasons.push('issue-rule-fact-application chain');
    if (assessment.respondsToOpponent) reasons.push('answers opponent');
    if (assessment.remedy) reasons.push('states relief');
    if (prof >= 1) reasons.push('courtroom length and focus');
    if (prof < 0) reasons.push('decorum or focus needs work');
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

  const dimBits = [
    eng !== 0 ? `${SCORE_DIMENSION_LABELS.engagement} ${eng > 0 ? '+' : ''}${eng}` : '',
    adv !== 0 ? `${SCORE_DIMENSION_LABELS.advocacy} ${adv > 0 ? '+' : ''}${adv}` : '',
    resp !== 0 ? `${SCORE_DIMENSION_LABELS.responsiveness} ${resp > 0 ? '+' : ''}${resp}` : '',
    prof !== 0 ? `${SCORE_DIMENSION_LABELS.professionalism} ${prof > 0 ? '+' : ''}${prof}` : '',
  ].filter(Boolean);

  const reasonCore = reasons.length ? reasons.join('; ') : 'submission recorded';
  const scoreReason = dimBits.length
    ? `${reasonCore} [${dimBits.join(', ')}]; structure signals only`
    : `${reasonCore}; structure signals only`;

  return {
    score,
    scoreDelta: score.total - previous.total,
    scoreReason,
    assessment,
  };
};

export const scoreObjection = (
  previous: TrialScoreBreakdown,
  outcome: ObjectionDetails['outcome'],
  wasQuick: boolean,
  basisText = '',
): ScoreResult => {
  // Basis quality: empty or one-word bases should not fully reward a sustained ruling.
  const basis = basisText.trim();
  const basisThin = basis.length > 0 && basis.length < 24;
  const basisOk = basis.length >= 24
    && findPositiveSignal(basis.toLowerCase(), /\b(relevance|hearsay|privilege|foundation|prejudice|speculation|leading|argumentative|misstates|assumes|beyond|scope|authority|section|article|rule|record|evidence)\b/i);

  let objectionDelta = outcome === 'sustained' ? 8 : outcome === 'overruled' ? -4 : 2;
  let engDelta = outcome === 'overruled' ? 0 : (wasQuick ? 2 : 1);
  let respDelta = outcome === 'overruled' ? 0 : 1;
  let profDelta = outcome === 'overruled' ? -2 : 1;

  if (outcome === 'sustained') {
    if (basisThin) {
      objectionDelta = 4;
      engDelta = wasQuick ? 1 : 0;
      respDelta = 0;
      profDelta = 0;
    } else if (basis.length >= 24 && !basisOk) {
      objectionDelta = 6;
      // Long-enough but legally ungrounded basis: same quickness gate as the
      // thin branch — only a fast objection shows real courtroom instinct.
      engDelta = wasQuick ? 1 : 0;
    }
  }
  if (outcome === 'reserved' && basisThin) {
    objectionDelta = 0;
    engDelta = 0;
    respDelta = 0;
    profDelta = 0;
  }

  const score = recalculateScore({
    engagement: previous.engagement + engDelta,
    advocacy: previous.advocacy,
    objections: previous.objections + objectionDelta,
    responsiveness: previous.responsiveness + respDelta,
    professionalism: previous.professionalism + profDelta,
  });

  const scoreReason = outcome === 'sustained'
    ? (basisThin
      ? 'objection sustained (thin basis)'
      : wasQuick
        ? 'objection sustained (quick)'
        : 'objection sustained')
    : outcome === 'overruled'
      ? 'objection overruled'
      : basisThin
        ? 'objection reserved (state a legal basis)'
        : 'objection reserved';

  return {
    score,
    scoreDelta: score.total - previous.total,
    scoreReason: `${scoreReason}; practice signal only`,
    assessment: {
      score: outcome === 'sustained' ? (basisThin ? 5 : 8) : outcome === 'overruled' ? 3 : 5,
      issue: true,
      rule: outcome !== 'overruled' && !basisThin,
      facts: true,
      application: outcome !== 'overruled' && !basisThin,
      remedy: false,
      respondsToOpponent: true,
      nextStep: outcome === 'overruled'
        ? 'Refine the legal basis before raising the objection again.'
        : basisThin
          ? 'State the rule or record ground that supports the objection.'
          : 'Carry the ruling into your next submission.',
    },
  };
};

export const inferNextPhase = (messages: ChatMessage[]): TrialPhase => {
  const substantive = messages.filter(msg => msg.sender === 'user' && msg.meta?.kind !== 'objection');
  const substantiveUserTurns = substantive.length;
  const qualities = substantive.map(message => message.meta?.argumentQuality?.score);
  const measured = qualities.filter((score): score is number => typeof score === 'number');
  // Missing quality metadata is treated as neutral (5), not zero, so turn flow still works
  // before assessments attach; measured weak scores still gate advancement.
  const averageQuality = substantive.length
    ? substantive.reduce((sum, message) => sum + (message.meta?.argumentQuality?.score ?? 5), 0) / substantive.length
    : 0;
  const strongTurns = substantive.filter(message => (message.meta?.argumentQuality?.score ?? 5) >= 5).length;
  const weakMeasured = measured.length > 0 && averageQuality < 5.5;

  // Quality gates: volume alone must not race to closing on weak advocacy.
  if (substantiveUserTurns <= 1) return 'opening';
  if (substantiveUserTurns <= 3 || averageQuality < 3.5) return 'issue_framing';
  if (substantiveUserTurns <= 5 || averageQuality < 4.5 || (measured.length >= 2 && strongTurns < 2)) return 'rebuttal';
  if (substantiveUserTurns <= 7 || averageQuality < 5.5 || (measured.length >= 3 && strongTurns < 3)) {
    return 'judicial_questions';
  }
  if (weakMeasured || strongTurns < 4 || averageQuality < 6) return 'judicial_questions';
  return 'closing';
};

/**
 * Parse a ruling only from trusted Court text (judge stream), never from user input.
 * Callers must pass the judge response, not counsel submissions.
 */
export const detectObjectionOutcome = (rulingText: string): ObjectionDetails['outcome'] => {
  const lower = rulingText.toLowerCase();
  // Prefer decisive court language over incidental mentions.
  if (/\b(objection\s+is\s+)?sustained\b/.test(lower) && !/\bnot\s+sustained\b/.test(lower)) return 'sustained';
  if (/\b(objection\s+is\s+)?overruled\b/.test(lower) && !/\bnot\s+overruled\b/.test(lower)) return 'overruled';
  if (/\breserv(?:e|ed|es)\b/.test(lower)) return 'reserved';
  return 'reserved';
};

export const phaseLabel = (phase: TrialPhase) => phase.replace(/_/g, ' ');

/** Compact dimension snapshot for UI chips (monochrome-friendly labels). */
export const formatScoreDimensions = (score: TrialScoreBreakdown): string =>
  [
    `${SCORE_DIMENSION_LABELS.engagement} ${score.engagement}`,
    `${SCORE_DIMENSION_LABELS.advocacy} ${score.advocacy}`,
    `${SCORE_DIMENSION_LABELS.objections} ${score.objections}`,
    `${SCORE_DIMENSION_LABELS.responsiveness} ${score.responsiveness}`,
    `${SCORE_DIMENSION_LABELS.professionalism} ${score.professionalism}`,
  ].join(' · ');
