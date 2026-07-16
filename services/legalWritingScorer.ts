/**
 * Legal Writing Conformance Scorer (TypeScript port)
 * ===================================================
 * Scores prose against empirically derived benchmarks from 50 legal
 * journal articles. Pure client-side — no Python or server needed.
 *
 * Ported from: Archive/Cold_Drafts/.../scripts/score_legal_writing.py
 *
 * Integrity note: stylometry is gameable. We apply soft integrity caps
 * (vocabulary diversity, punctuation stuffing, n-gram repetition) so
 * punctuation salad / keyword spam cannot score as journal-quality.
 */

// ---------------------------------------------------------------------------
// Benchmark configuration
// ---------------------------------------------------------------------------

interface BenchmarkEntry {
  target: number;
  min: number;
  max: number;
  weight: number;
}

export interface MetricBreakdown {
  value: number;
  target: number;
  score: number;
  label: string;
  status: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ScoringResult {
  totalScore: number;
  verdict: string;
  verdictTier: 'excellent' | 'good' | 'fair' | 'poor';
  breakdown: Record<string, MetricBreakdown>;
  aiTellCount: number;
  wordCount: number;
  sentenceCount: number;
  /** Soft integrity penalties applied (empty when draft looks natural). */
  qualityNotes?: string[];
}

/** Minimum trimmed length before scoring is meaningful. */
export const MIN_SCOREABLE_CHARS = 50;
/** Soft floor on distinct words relative to total words. */
const MIN_TYPE_TOKEN_RATIO = 0.28;
/** Above this punctuation-to-word ratio, treat as stuffing. */
const MAX_PUNCT_PER_WORD = 0.55;
/** Repeated bigram share above this triggers a cap. */
const MAX_BIGRAM_REPEAT_RATIO = 0.35;

const BENCHMARKS: Record<string, BenchmarkEntry> = {
  avg_sentence_length:        { target: 36.70, min: 30.0,  max: 42.0,  weight: 1.0  },
  pct_simple_sentences:       { target: 26.06, min: 20.0,  max: 32.0,  weight: 0.8  },
  pct_compound_complex:       { target: 73.94, min: 68.0,  max: 80.0,  weight: 0.8  },
  comma_interval:             { target: 15.77, min: 14.0,  max: 18.0,  weight: 1.0  },
  commas_per_1k:              { target: 63.4,  min: 55.0,  max: 72.0,  weight: 0.7  },
  semicolons_per_1k:          { target: 2.6,   min: 1.5,   max: 4.0,   weight: 0.5  },
  colons_per_1k:              { target: 3.2,   min: 2.0,   max: 5.0,   weight: 0.5  },
  parentheses_per_1k:         { target: 22.8,  min: 18.0,  max: 28.0,  weight: 0.7  },
  hyphens_per_1k:             { target: 13.0,  min: 9.0,   max: 17.0,  weight: 0.5  },
  quotes_per_1k:              { target: 11.4,  min: 7.0,   max: 16.0,  weight: 0.5  },
  connector_pivot_sentences:  { target: 7.12,  min: 5.0,   max: 9.0,   weight: 0.9  },
  legal_vocab_pct:            { target: 1.09,  min: 0.8,   max: 1.5,   weight: 0.6  },
  sentence_length_stddev:     { target: 14.0,  min: 10.0,  max: 20.0,  weight: 0.8  },
  passive_voice_pct:          { target: 30.0,  min: 25.0,  max: 35.0,  weight: 0.7  },
};

const METRIC_LABELS: Record<string, string> = {
  avg_sentence_length:        'Avg. Sentence Length',
  pct_simple_sentences:       'Simple Sentences %',
  pct_compound_complex:       'Compound/Complex %',
  comma_interval:             'Comma Interval',
  commas_per_1k:              'Commas / 1k words',
  semicolons_per_1k:          'Semicolons / 1k',
  colons_per_1k:              'Colons / 1k',
  parentheses_per_1k:         'Parentheses / 1k',
  hyphens_per_1k:             'Hyphens / 1k',
  quotes_per_1k:              'Quotes / 1k',
  connector_pivot_sentences:  'Connector Pivot',
  legal_vocab_pct:            'Legal Vocabulary %',
  sentence_length_stddev:     'Sentence Length σ',
  passive_voice_pct:          'Passive Voice %',
};

// ---------------------------------------------------------------------------
// Vocabulary and pattern sets
// ---------------------------------------------------------------------------

const LEGAL_VOCAB = new Set([
  'plaintiff', 'defendant', 'court', 'appellate', 'jurisdiction',
  'affirmed', 'statute', 'tort', 'contract', 'liability',
  'damages', 'decree', 'petitioner', 'respondent', 'certiorari',
  'stare', 'decisis', 'injunction', 'subpoena', 'affidavit',
  'brief', 'briefs', 'appellant', 'appellee', 'litigation',
  'prosecution', 'defense', 'verdict', 'testimony',
  'adjudication', 'amicus', 'curiae', 'habeas', 'corpus',
  'indictment', 'acquittal', 'appeal', 'appeals', 'judge',
  'justice', 'justices', 'law', 'legal', 'constitution',
  'constitutional', 'rights', 'remedy', 'breach', 'covenant',
  'equity', 'felony', 'misdemeanor', 'negligence', 'replevin',
  'supreme', 'tribunal', 'writ', 'judgment', 'evidence', 'clause',
  'amendment', 'statutory', 'precedent', 'motion', 'docket',
  'hearsay', 'remand', 'remanded', 'claim', 'dismissed',
  'estoppel', 'laches', 'prima', 'facie', 'obiter', 'dictum',
  'ratio', 'decidendi', 'judicata', 'supra', 'infra',
]);

const CONNECTORS = new Set([
  'however', 'moreover', 'furthermore', 'therefore', 'consequently',
  'thus', 'accordingly', 'nevertheless', 'further', 'additionally',
  'hence', 'subsequently', 'alternatively', 'notwithstanding',
  'arguably', 'admittedly',
]);

const AI_TELLS = [
  'it is important to note',
  "in today's world",
  'in the modern era',
  'this essay explores',
  'this paper explores',
  'this article explores',
  'this essay examines',
  'this paper examines',
  'this article examines',
  'let us now turn to',
  'we shall examine',
  'it is worth mentioning',
  'delves into',
  'tapestry',
  'multifaceted',
  'holistic',
  'navigate the complexities',
  'robust framework',
  'landscape of',
  'this is because',
];

// Non-global: safe to call repeatedly without lastIndex side effects.
const PASSIVE_RE = /\b(is|are|was|were|been|being|be)\s+([a-z]+ed|[a-z]+en)\b/i;

// ---------------------------------------------------------------------------
// Tokenisation helpers
// ---------------------------------------------------------------------------

function splitSentences(raw: string): string[] {
  let text = raw.replace(/\n+/g, ' ');

  // Protect common abbreviations
  const abbrevs = ['U.S.T.', 'Rev.', 'L.J.', "Int'l L.", 'U.N.T.S.', 'Id.', 'v.', 'Inc.', 'Corp.', 'Bros.', 'Co.'];
  for (const abbr of abbrevs) {
    text = text.split(abbr).join(abbr.replace(/\./g, '<DOT>'));
  }

  // Protect single-letter initials
  text = text.replace(/(?<=\s)[A-Z]\./g, (m) => m.replace('.', '<DOT>'));
  text = text.replace(/^[A-Z]\./g, (m) => m.replace('.', '<DOT>'));

  const sents = text.split(/(?<=[.!?])\s+(?=[A-Z"])/);
  return sents.map(s => s.replace(/<DOT>/g, '.').trim()).filter(s => s.length > 5);
}

function tokeniseWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-zA-Z'-]+/g) || []);
}

const VERB_ENDINGS = ['ed', 'ing', 'es', 'fy', 'ize', 'ise', 'ate'];
const COMMON_VERBS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'shall',
  'will', 'should', 'would', 'could', 'may', 'might',
  'must', 'can', 'need', 'hold', 'held', 'find', 'found',
  'make', 'made', 'give', 'gave', 'take', 'took', 'see',
  'saw', 'know', 'knew', 'say', 'said', 'provide', 'require',
  'establish', 'argue', 'contend', 'submit', 'maintain',
  'assert', 'conclude', 'determine', 'apply', 'consider',
]);

function countVerbsApprox(words: string[]): number {
  let count = 0;
  for (const w of words) {
    if (COMMON_VERBS.has(w) || VERB_ENDINGS.some(e => w.endsWith(e))) {
      count++;
    }
  }
  return count;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Integrity / anti-gaming checks
// ---------------------------------------------------------------------------

interface IntegrityAssessment {
  /** Maximum allowed total score after stylometry (0–100). */
  cap: number;
  notes: string[];
}

function assessIntegrity(text: string, words: string[]): IntegrityAssessment {
  const notes: string[] = [];
  let cap = 100;

  if (words.length < 40) {
    // Short-but-scoreable drafts are noisy; keep ceiling modest.
    cap = Math.min(cap, 78);
    notes.push('Draft is short; score is provisional.');
  }

  const unique = new Set(words);
  const ttr = unique.size / Math.max(words.length, 1);
  if (ttr < MIN_TYPE_TOKEN_RATIO) {
    cap = Math.min(cap, 55);
    notes.push('Low vocabulary diversity — possible repetition or keyword stuffing.');
  } else if (ttr < 0.38) {
    cap = Math.min(cap, 72);
    notes.push('Limited vocabulary diversity relative to journal prose.');
  }

  const punct = (text.match(/[,;:()[\]{}"'\u201c\u201d\u2014\u2013-]/g) || []).length;
  const punctPerWord = punct / Math.max(words.length, 1);
  if (punctPerWord > MAX_PUNCT_PER_WORD) {
    cap = Math.min(cap, 48);
    notes.push('Punctuation density looks artificial (possible metric gaming).');
  } else if (punctPerWord > 0.4) {
    cap = Math.min(cap, 70);
    notes.push('Elevated punctuation density relative to natural legal prose.');
  }

  // Bigram repetition: high share of the most common bigram ⇒ copy-paste loops.
  if (words.length >= 20) {
    const bigramCounts = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
      const key = `${words[i]} ${words[i + 1]}`;
      bigramCounts.set(key, (bigramCounts.get(key) || 0) + 1);
    }
    const totalBigrams = words.length - 1;
    let top = 0;
    for (const count of bigramCounts.values()) top = Math.max(top, count);
    const topRatio = top / totalBigrams;
    if (topRatio > MAX_BIGRAM_REPEAT_RATIO) {
      cap = Math.min(cap, 50);
      notes.push('Heavy phrase repetition detected.');
    } else if (topRatio > 0.18) {
      cap = Math.min(cap, 75);
      notes.push('Noticeable phrase repetition.');
    }
  }

  // Extreme legal-vocab saturation without sentence structure variety is spammy.
  const legalHits = words.filter((w) => LEGAL_VOCAB.has(w)).length;
  const legalPct = (legalHits / Math.max(words.length, 1)) * 100;
  if (legalPct > 8) {
    cap = Math.min(cap, 60);
    notes.push('Legal vocabulary density far above journal norms.');
  }

  return { cap, notes };
}

// ---------------------------------------------------------------------------
// Metric extraction
// ---------------------------------------------------------------------------

interface RawMetrics {
  avg_sentence_length: number;
  pct_simple_sentences: number;
  pct_compound_complex: number;
  comma_interval: number;
  commas_per_1k: number;
  semicolons_per_1k: number;
  colons_per_1k: number;
  parentheses_per_1k: number;
  hyphens_per_1k: number;
  quotes_per_1k: number;
  connector_pivot_sentences: number;
  legal_vocab_pct: number;
  sentence_length_stddev: number;
  passive_voice_pct: number;
  ai_tell_count: number;
  num_words: number;
  num_sentences: number;
}

function extractMetrics(text: string): RawMetrics | null {
  const sentences = splitSentences(text);
  const allWords = tokeniseWords(text);
  const numWords = allWords.length;
  const numSentences = sentences.length;

  if (numSentences === 0 || numWords === 0) return null;

  // Sentence lengths
  const sentLengths: number[] = [];
  let simple = 0;
  let compound = 0;

  for (const s of sentences) {
    const sWords = tokeniseWords(s);
    sentLengths.push(sWords.length);
    if (countVerbsApprox(sWords) <= 1) {
      simple++;
    } else {
      compound++;
    }
  }

  const avgSentLen = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
  // Population stddev is fine for stylistic spread; guard single-sentence case.
  const sentStddev = sentLengths.length < 2
    ? 0
    : Math.sqrt(
      sentLengths.reduce((sum, l) => sum + (l - avgSentLen) ** 2, 0) / sentLengths.length,
    );

  // Punctuation counts
  const commas = (text.match(/,/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const hyphens = (text.match(/[-\u2014\u2013]/g) || []).length;
  const quotes = (text.match(/["\u201c\u201d']/g) || []).length;
  const parens = (text.match(/[()]/g) || []).length;

  const r = (count: number) => (count / numWords) * 1000;
  // Unbounded 999 inflated "outside band" scores unpredictably; clamp to a
  // soft ceiling so missing commas degrade smoothly rather than hard-fail.
  const commaInterval = commas > 0 ? numWords / commas : Math.min(numWords, 80);

  // Connectors
  const connectorCount = allWords.filter(w => CONNECTORS.has(w)).length;
  const connectorPivot = connectorCount > 0
    ? numSentences / connectorCount
    : Math.min(numSentences * 2, 40);

  // Legal vocab
  const legalCount = allWords.filter(w => LEGAL_VOCAB.has(w)).length;
  const legalPct = (legalCount / numWords) * 100;

  // Passive voice estimate (non-global regex — no lastIndex thrash)
  const passiveSents = sentences.filter((s) => PASSIVE_RE.test(s)).length;
  const passivePct = Math.min((passiveSents / numSentences) * 100, 100);

  // AI Tells
  const textLower = text.toLowerCase();
  const aiTellCount = AI_TELLS.filter(phrase => textLower.includes(phrase)).length;

  return {
    avg_sentence_length:       round2(avgSentLen),
    pct_simple_sentences:      round2((simple / numSentences) * 100),
    pct_compound_complex:      round2((compound / numSentences) * 100),
    comma_interval:            round2(commaInterval),
    commas_per_1k:             round2(r(commas)),
    semicolons_per_1k:         round2(r(semicolons)),
    colons_per_1k:             round2(r(colons)),
    parentheses_per_1k:        round2(r(parens)),
    hyphens_per_1k:            round2(r(hyphens)),
    quotes_per_1k:             round2(r(quotes)),
    connector_pivot_sentences: round2(connectorPivot),
    legal_vocab_pct:           round2(legalPct),
    sentence_length_stddev:    round2(sentStddev),
    passive_voice_pct:         round2(passivePct),
    ai_tell_count:             aiTellCount,
    num_words:                 numWords,
    num_sentences:             numSentences,
  };
}

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

function scoreMetric(value: number, bench: BenchmarkEntry): number {
  const { target, min: lo, max: hi } = bench;

  if (value >= lo && value <= hi) {
    // Within tolerance band: 70–100
    const halfRange = (hi - lo) / 2;
    const distFromTarget = Math.abs(value - target);
    if (halfRange === 0) return 100.0;
    // Clamp closeness so overshoot past band edge never yields >100 or <70 here.
    const closeness = Math.max(0, Math.min(1, 1.0 - distFromTarget / halfRange));
    return 70.0 + closeness * 30.0;
  }

  // Outside band: decay from 70 toward 0 using distance relative to band width
  // (more stable than distance / absolute edge value, which punished low targets).
  const bandWidth = Math.max(hi - lo, 1);
  const dist = value < lo ? lo - value : value - hi;
  const decay = Math.max(0, 1.0 - dist / (bandWidth * 2));
  return decay * 70.0;
}

function getTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

function buildVerdict(total: number, integrityCapped: boolean): {
  verdict: string;
  verdictTier: ScoringResult['verdictTier'];
} {
  let verdict: string;
  let verdictTier: ScoringResult['verdictTier'];
  if (total >= 90) {
    verdict = 'Excellent — Structurally close to journal-quality stylometric norms.';
    verdictTier = 'excellent';
  } else if (total >= 75) {
    verdict = 'Good — Minor calibration needed on specific metrics.';
    verdictTier = 'good';
  } else if (total >= 60) {
    verdict = 'Fair — Several structural markers deviate from journal norms.';
    verdictTier = 'fair';
  } else {
    verdict = 'Needs Work — Significant departure from legal writing benchmarks.';
    verdictTier = 'poor';
  }
  if (integrityCapped) {
    verdict += ' Integrity checks limited the ceiling (diversity/repetition/punctuation).';
  }
  return { verdict, verdictTier };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a legal draft against the empirical benchmarks.
 * Returns null if text is too short to analyse meaningfully.
 */
export function scoreLegalWriting(text: string): ScoringResult | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < MIN_SCOREABLE_CHARS) return null;

  const metrics = extractMetrics(trimmed);
  if (!metrics) return null;
  // Require a minimum of 2 sentences so stddev / structure metrics mean something.
  if (metrics.num_sentences < 2 || metrics.num_words < 20) return null;

  const words = tokeniseWords(trimmed);
  const integrity = assessIntegrity(trimmed, words);

  const breakdown: Record<string, MetricBreakdown> = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [key, bench] of Object.entries(BENCHMARKS)) {
    const value = (metrics as unknown as Record<string, number>)[key];
    if (typeof value !== 'number' || Number.isNaN(value)) continue;

    const s = scoreMetric(value, bench);
    breakdown[key] = {
      value:  round2(value),
      target: bench.target,
      score:  Math.round(s * 10) / 10,
      label:  METRIC_LABELS[key] || key,
      status: getTier(s),
    };
    weightedSum += s * bench.weight;
    weightTotal += bench.weight;
  }

  // AI-tell penalty: -5 per instance (capped so a single draft cannot go fully
  // negative from tells alone before integrity).
  const aiPenalty = Math.min(metrics.ai_tell_count * 5, 40);
  let total = weightTotal > 0 ? (weightedSum / weightTotal) - aiPenalty : 0;
  total = Math.max(0, Math.min(100, total));

  const integrityCapped = total > integrity.cap;
  if (integrityCapped) total = integrity.cap;
  total = round2(total);

  const { verdict, verdictTier } = buildVerdict(total, integrityCapped);

  return {
    totalScore: total,
    verdict,
    verdictTier,
    breakdown,
    aiTellCount: metrics.ai_tell_count,
    wordCount: metrics.num_words,
    sentenceCount: metrics.num_sentences,
    qualityNotes: integrity.notes.length ? integrity.notes : undefined,
  };
}
