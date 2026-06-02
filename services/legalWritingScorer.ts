/**
 * Legal Writing Conformance Scorer (TypeScript port)
 * ===================================================
 * Scores prose against empirically derived benchmarks from 50 legal
 * journal articles. Pure client-side — no Python or server needed.
 *
 * Ported from: Archive/Cold_Drafts/.../scripts/score_legal_writing.py
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
}

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

const PASSIVE_RE = /\b(is|are|was|were|been|being|be)\s+(\w+ed|(\w+en))\b/gi;

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
  const sentStddev = Math.sqrt(
    sentLengths.reduce((sum, l) => sum + (l - avgSentLen) ** 2, 0) / sentLengths.length
  );

  // Punctuation counts
  const commas = (text.match(/,/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const hyphens = (text.match(/[-\u2014\u2013]/g) || []).length;
  const quotes = (text.match(/["\u201c\u201d']/g) || []).length;
  const parens = (text.match(/[()]/g) || []).length;

  const r = (count: number) => (count / numWords) * 1000;
  const commaInterval = commas > 0 ? numWords / commas : 999;

  // Connectors
  const connectorCount = allWords.filter(w => CONNECTORS.has(w)).length;
  const connectorPivot = connectorCount > 0 ? numSentences / connectorCount : 999;

  // Legal vocab
  const legalCount = allWords.filter(w => LEGAL_VOCAB.has(w)).length;
  const legalPct = (legalCount / numWords) * 100;

  // Passive voice estimate
  const passiveSents = sentences.filter(s => PASSIVE_RE.test(s)).length;
  // Reset regex lastIndex since it's global
  PASSIVE_RE.lastIndex = 0;
  const passivePct = Math.min((passiveSents / numSentences) * 100, 100);

  // AI Tells
  const textLower = text.toLowerCase();
  const aiTellCount = AI_TELLS.filter(phrase => textLower.includes(phrase)).length;

  return {
    avg_sentence_length:       Math.round(avgSentLen * 100) / 100,
    pct_simple_sentences:      Math.round((simple / numSentences) * 10000) / 100,
    pct_compound_complex:      Math.round((compound / numSentences) * 10000) / 100,
    comma_interval:            Math.round(commaInterval * 100) / 100,
    commas_per_1k:             Math.round(r(commas) * 100) / 100,
    semicolons_per_1k:         Math.round(r(semicolons) * 100) / 100,
    colons_per_1k:             Math.round(r(colons) * 100) / 100,
    parentheses_per_1k:        Math.round(r(parens) * 100) / 100,
    hyphens_per_1k:            Math.round(r(hyphens) * 100) / 100,
    quotes_per_1k:             Math.round(r(quotes) * 100) / 100,
    connector_pivot_sentences: Math.round(connectorPivot * 100) / 100,
    legal_vocab_pct:           Math.round(legalPct * 100) / 100,
    sentence_length_stddev:    Math.round(sentStddev * 100) / 100,
    passive_voice_pct:         Math.round(passivePct * 100) / 100,
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
    const closeness = 1.0 - distFromTarget / halfRange;
    return 70.0 + closeness * 30.0;
  } else {
    // Outside band: decay from 70 toward 0
    let dist: number;
    let band: number;
    if (value < lo) {
      dist = lo - value;
      band = lo;
    } else {
      dist = value - hi;
      band = hi;
    }
    const decay = Math.max(0, 1.0 - dist / Math.max(band, 1));
    return decay * 70.0;
  }
}

function getTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a legal draft against the empirical benchmarks.
 * Returns null if text is too short to analyse meaningfully.
 */
export function scoreLegalWriting(text: string): ScoringResult | null {
  if (!text || text.trim().length < 50) return null;

  const metrics = extractMetrics(text);
  if (!metrics) return null;

  const breakdown: Record<string, MetricBreakdown> = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [key, bench] of Object.entries(BENCHMARKS)) {
    const value = (metrics as any)[key];
    if (value === undefined) continue;

    const s = scoreMetric(value, bench);
    breakdown[key] = {
      value:  Math.round(value * 100) / 100,
      target: bench.target,
      score:  Math.round(s * 10) / 10,
      label:  METRIC_LABELS[key] || key,
      status: getTier(s),
    };
    weightedSum += s * bench.weight;
    weightTotal += bench.weight;
  }

  // AI-tell penalty: -5 per instance
  const aiPenalty = metrics.ai_tell_count * 5;
  let total = weightTotal > 0 ? (weightedSum / weightTotal) - aiPenalty : 0;
  total = Math.max(0, Math.min(100, total));
  total = Math.round(total * 100) / 100;

  let verdict: string;
  let verdictTier: ScoringResult['verdictTier'];
  if (total >= 90) {
    verdict = 'Excellent — Structurally indistinguishable from journal-quality writing.';
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

  return {
    totalScore: total,
    verdict,
    verdictTier,
    breakdown,
    aiTellCount: metrics.ai_tell_count,
    wordCount: metrics.num_words,
    sentenceCount: metrics.num_sentences,
  };
}
