import {
  DEFAULT_SCORE_BREAKDOWN,
  assessArgument,
  detectObjectionOutcome,
  inferNextPhase,
  scoreObjection,
  scoreSubmission,
} from './trialScoring';
import type { ChatMessage } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Argument quality is structural, not just a keyword counter.
{
  const assessment = assessArgument(
    'The issue is whether the State denied a hearing. Under Article 21, the record and notice show no hearing was offered; therefore the restriction fails. We seek an order setting it aside. However, opposing counsel cannot cure that defect after the event.',
  );
  assert(assessment.score >= 8, `expected a structurally complete argument, got ${assessment.score}`);
  assert(assessment.application && assessment.remedy && assessment.respondsToOpponent, 'expected application, relief, and rebuttal signals');

  const missingLink = assessArgument('The issue is whether Article 21 applies to this case.');
  assert(missingLink.nextStep.includes('relief'), `expected a remedy next step, got ${missingLink.nextStep}`);
}

const base = { ...DEFAULT_SCORE_BREAKDOWN };

// Spam should not inflate engagement/advocacy freely
{
  const result = scoreSubmission(base, 'ok');
  assert(result.score.total <= base.total, 'spam should not increase total score');
  assert(result.scoreReason.includes('brief'), `expected brief reason, got ${result.scoreReason}`);
}

// Duplicate dampening
{
  const first = scoreSubmission(base, 'Because the evidence on record shows breach under Section 73 of the Contract Act, relief must follow.');
  const second = scoreSubmission(first.score, 'Because the evidence on record shows breach under Section 73 of the Contract Act, relief must follow.', [
    'Because the evidence on record shows breach under Section 73 of the Contract Act, relief must follow.',
  ]);
  assert(second.scoreDelta <= 2, `duplicate should earn little credit, delta=${second.scoreDelta}`);
  assert(second.scoreReason.includes('repeats'), second.scoreReason);
}

// Strong submission earns points and cites law
{
  const result = scoreSubmission(
    base,
    'My Lord, under Article 21 and the authority in Maneka Gandhi, the record shows the petitioner was denied a hearing. Therefore the burden lies on the State to justify the restriction.',
  );
  assert(result.score.total > base.total, 'substantive argument should increase score');
  assert(result.scoreReason.includes('cites law') || result.scoreReason.includes('applies facts'), result.scoreReason);
  assert(result.score.engagement <= 50, 'engagement capped');
  assert(result.score.advocacy <= 50, 'advocacy capped');
}

// Objection outcomes
{
  const sustained = scoreObjection(base, 'sustained', true);
  const overruled = scoreObjection(base, 'overruled', false);
  assert(sustained.score.objections > base.objections, 'sustained raises objections score');
  assert(overruled.score.objections < base.objections || overruled.scoreDelta < 0, 'overruled should not reward');
  assert(sustained.scoreReason.includes('sustained'), sustained.scoreReason);
}

// Phase progression
{
  const mk = (n: number): ChatMessage[] =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      sender: 'user' as const,
      text: `arg ${i}`,
      timestamp: new Date(),
      meta: { kind: 'argument' as const },
    }));
  assert(inferNextPhase(mk(1)) === 'opening', '1 turn → opening');
  assert(inferNextPhase(mk(3)) === 'issue_framing', '3 turns → issue_framing');
  assert(inferNextPhase(mk(5)) === 'rebuttal', '5 turns → rebuttal');
  assert(inferNextPhase(mk(7)) === 'judicial_questions', '7 turns → judicial_questions');
  assert(inferNextPhase(mk(10)) === 'closing', '10 turns → closing');

  const lowQuality = mk(8).map(message => ({ ...message, meta: { ...message.meta, argumentQuality: {
    score: 1, issue: false, rule: false, facts: false, application: false, remedy: false, respondsToOpponent: false, nextStep: 'Add substance.',
  } }}));
  assert(inferNextPhase(lowQuality) === 'issue_framing', 'weak arguments should not skip foundational phase work');
}

// Ruling text parse
assert(detectObjectionOutcome('Objection is Sustained.') === 'sustained', 'detect sustained');
assert(detectObjectionOutcome('Overruled.') === 'overruled', 'detect overruled');
assert(detectObjectionOutcome('The Court reserves.') === 'reserved', 'detect reserved');

console.log('trialScoring tests passed');
