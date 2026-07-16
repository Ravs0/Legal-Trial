import { MIN_SCOREABLE_CHARS, scoreLegalWriting } from './legalWritingScorer';

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const benchmarkLikeDraft = `
The plaintiff submits that the defendant's breach was not merely technical, but material, because the notice clause was designed to allocate commercial risk before performance became impossible. However, the record shows that the respondent received no meaningful opportunity to cure the default, and therefore the claimed acceleration of liability should be treated with caution.

The court should apply the statutory framework in light of precedent, evidence, and the parties' contractual allocation of responsibility. Moreover, where a tribunal is asked to convert a procedural default into damages, the judgment must identify causation with precision; otherwise, the remedy becomes punitive rather than compensatory.

Accordingly, the petitioner is entitled to a declaration that the demand was defective, while the damages claim should be remanded for proof of actual loss. This approach respects the contract, preserves the remedy, and avoids rewarding a party that ignored its own notice obligations.
`;

const aiTellDraft = `${benchmarkLikeDraft}\nIt is important to note that this essay explores the multifaceted landscape of legal remedies in today's world.`;

// High punctuation density + tiny vocabulary — should hit integrity caps.
const punctuationSalad = Array.from({ length: 30 }, (_, i) =>
  `Plaintiff, defendant; court: (statute) "precedent"—liability, damages; judgment: (remedy) "claim"—${i}.`,
).join(' ');

function testShortDraftReturnsNull() {
  assertEqual(scoreLegalWriting('Too short.'), null, 'short draft result');
  assertEqual(scoreLegalWriting(''), null, 'empty draft result');
  assertEqual(scoreLegalWriting('x'.repeat(MIN_SCOREABLE_CHARS - 1)), null, 'just-under-min result');
}

function testBenchmarkLikeDraftReturnsStableShape() {
  const result = scoreLegalWriting(benchmarkLikeDraft);

  assert(result !== null, 'benchmark-like draft should produce a result');
  assert(result.wordCount > 100, `expected word count above 100, got ${result.wordCount}`);
  assert(result.sentenceCount >= 5, `expected at least 5 sentences, got ${result.sentenceCount}`);
  assert(result.totalScore >= 0 && result.totalScore <= 100, `score out of range: ${result.totalScore}`);
  assert(['excellent', 'good', 'fair', 'poor'].includes(result.verdictTier), `unknown verdict tier: ${result.verdictTier}`);
  assert(result.breakdown.avg_sentence_length !== undefined, 'missing average sentence length breakdown');
  assert(result.breakdown.legal_vocab_pct !== undefined, 'missing legal vocabulary breakdown');
  assert(result.breakdown.passive_voice_pct !== undefined, 'missing passive voice breakdown');
  // Metric scores must stay in band.
  for (const [key, metric] of Object.entries(result.breakdown)) {
    assert(metric.score >= 0 && metric.score <= 100, `${key} metric score out of range: ${metric.score}`);
  }
}

function testAiTellCountAndPenaltyAreVisible() {
  const clean = scoreLegalWriting(benchmarkLikeDraft);
  const flagged = scoreLegalWriting(aiTellDraft);

  assert(clean !== null, 'clean draft should produce a result');
  assert(flagged !== null, 'AI-tell draft should produce a result');
  assertEqual(clean.aiTellCount, 0, 'clean AI tell count');
  assert(flagged.aiTellCount >= 3, `expected at least 3 AI tells, got ${flagged.aiTellCount}`);
  assert(flagged.totalScore < clean.totalScore, `expected AI-tell draft score ${flagged.totalScore} to be below clean score ${clean.totalScore}`);
}

function testPunctuationSaladIsCappedBelowCleanBaseline() {
  const clean = scoreLegalWriting(benchmarkLikeDraft);
  const salad = scoreLegalWriting(punctuationSalad);

  assert(clean !== null, 'clean draft should score');
  assert(salad !== null, 'punctuation salad should still produce a structured result');
  assert(salad.totalScore <= 60, `expected integrity-capped salad score ≤ 60, got ${salad.totalScore}`);
  assert(salad.totalScore < clean.totalScore, 'salad should score below clean baseline');
  assert(
    Array.isArray(salad.qualityNotes) && salad.qualityNotes.length > 0,
    'salad should surface quality notes',
  );
}

function testNonStringReturnsNull() {
  assertEqual(scoreLegalWriting(null as unknown as string), null, 'null input');
  assertEqual(scoreLegalWriting(undefined as unknown as string), null, 'undefined input');
}

testShortDraftReturnsNull();
testBenchmarkLikeDraftReturnsStableShape();
testAiTellCountAndPenaltyAreVisible();
testPunctuationSaladIsCappedBelowCleanBaseline();
testNonStringReturnsNull();

console.log('legalWritingScorer tests passed');
