import {
  DEFAULT_SCORE_BREAKDOWN,
  assessArgument,
  detectObjectionOutcome,
  formatScoreDimensions,
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
  assert(
    missingLink.nextStep.toLowerCase().includes('fact')
      || missingLink.nextStep.toLowerCase().includes('record')
      || missingLink.nextStep.toLowerCase().includes('relief')
      || missingLink.nextStep.toLowerCase().includes('application'),
    `expected a concrete next step for the missing link, got ${missingLink.nextStep}`,
  );
  assert(missingLink.score < assessment.score, 'incomplete argument should score below complete one');
}

// Negation: disclaiming authority must not earn rule credit.
{
  const negated = assessArgument(
    'The issue is whether liability attaches. No statute applies and no authority supports the claim on these bare assertions; therefore nothing follows. We seek no relief.',
  );
  assert(!negated.rule, 'negated statute/authority language should not earn rule credit');
  assert(negated.score <= 5, `negated thin argument should stay modest, got ${negated.score}`);
}

// Cheap "however" alone is not responsiveness.
{
  const cheap = assessArgument(
    'The issue is whether Section 73 of the Contract Act governs. The record shows breach of the notice term. Therefore damages follow. However relief is clear.',
  );
  assert(cheap.rule && cheap.facts && cheap.application, 'expected core IRAC signals');
  assert(!cheap.respondsToOpponent, 'lone however without opposing position should not count as rebuttal');
}

// Off-topic structured rant / keyword template should not max out.
{
  const template = assessArgument(
    'The issue is whether the case under the act and section and statute and precedent and authority. The record evidence fact affidavit. Because therefore thus accordingly applies fails shows. Relief remedy dismiss allow order. However contrary opposing counsel respondent argument.',
  );
  assert(template.score <= 6, `template spam should not max structure score, got ${template.score}`);
  assert(
    template.nextStep.toLowerCase().includes('template')
      || template.nextStep.toLowerCase().includes('concrete')
      || template.score < 8,
    'template path should coach toward concrete advocacy',
  );
}

const base = { ...DEFAULT_SCORE_BREAKDOWN };

// Spam should not inflate engagement/advocacy freely
{
  const result = scoreSubmission(base, 'ok');
  assert(result.score.total <= base.total, 'spam should not increase total score');
  assert(result.scoreReason.includes('brief'), `expected brief reason, got ${result.scoreReason}`);
}

// Duplicate dampening (exact and near-paraphrase)
{
  const firstText = 'Because the evidence on record shows breach under Section 73 of the Contract Act, relief must follow.';
  const first = scoreSubmission(base, firstText);
  const second = scoreSubmission(first.score, firstText, [firstText]);
  assert(second.scoreDelta <= 1, `duplicate should earn little credit, delta=${second.scoreDelta}`);
  assert(second.scoreReason.includes('repeats'), second.scoreReason);

  const paraphrase = 'Because the evidence on record shows breach under Section 73 of the Contract Act, the relief sought must follow from that breach.';
  const third = scoreSubmission(first.score, paraphrase, [firstText]);
  assert(third.scoreDelta <= 2, `near-duplicate paraphrase should be dampened, delta=${third.scoreDelta}`);
}

// Strong submission earns points and cites law
{
  const result = scoreSubmission(
    base,
    'My Lord, under Article 21 and the authority in Maneka Gandhi, the record shows the petitioner was denied a hearing. Therefore the burden lies on the State to justify the restriction. We seek an order setting the restriction aside.',
  );
  assert(result.score.total > base.total, 'substantive argument should increase score');
  assert(result.scoreReason.includes('cites law') || result.scoreReason.includes('applies facts'), result.scoreReason);
  assert(result.score.engagement <= 50, 'engagement capped');
  assert(result.score.advocacy <= 50, 'advocacy capped');
  assert(
    result.scoreReason.includes('Advocacy') || result.scoreReason.includes('structure signals'),
    'expected dimensional or structure feedback in reason',
  );
}

// Keyword-only template must not outscore a real chain
{
  const real = scoreSubmission(
    base,
    'The issue is whether the detention is lawful. Under Article 22, the record and the arrest memo show no grounds were supplied within the statutory time; therefore the detention fails the constitutional test. We seek an order of release. Opposing counsel cannot cure a blank memo after the fact.',
  );
  const spam = scoreSubmission(
    base,
    'issue whether case section act rule statute precedent authority record evidence fact because therefore applies relief remedy order however contrary opposing counsel',
  );
  assert(real.scoreDelta > spam.scoreDelta, `real advocacy (${real.scoreDelta}) should beat template spam (${spam.scoreDelta})`);
}

// Objection outcomes
{
  const sustained = scoreObjection(base, 'sustained', true, 'Hearsay: the witness recounts an out-of-court statement for its truth without an exception.');
  const overruled = scoreObjection(base, 'overruled', false, 'Relevance under the Evidence Act.');
  const thin = scoreObjection(base, 'sustained', true, 'no');
  assert(sustained.score.objections > base.objections, 'sustained raises objections score');
  assert(overruled.score.objections < base.objections || overruled.scoreDelta < 0, 'overruled should not reward');
  assert(sustained.scoreReason.includes('sustained'), sustained.scoreReason);
  assert(thin.score.objections < sustained.score.objections, 'thin basis should earn less than a grounded sustained objection');
}

// Phase progression
{
  const mk = (n: number, quality?: number): ChatMessage[] =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      sender: 'user' as const,
      text: `arg ${i}`,
      timestamp: new Date(),
      meta: {
        kind: 'argument' as const,
        ...(typeof quality === 'number'
          ? {
              argumentQuality: {
                score: quality,
                issue: quality >= 3,
                rule: quality >= 4,
                facts: quality >= 4,
                application: quality >= 5,
                remedy: quality >= 6,
                respondsToOpponent: quality >= 5,
                nextStep: 'Continue.',
              },
            }
          : {}),
      },
    }));
  assert(inferNextPhase(mk(1)) === 'opening', '1 turn → opening');
  assert(inferNextPhase(mk(3)) === 'issue_framing', '3 turns → issue_framing');
  assert(inferNextPhase(mk(5)) === 'rebuttal', '5 turns → rebuttal');
  assert(inferNextPhase(mk(7)) === 'judicial_questions', '7 turns → judicial_questions');
  // Volume without quality must not race to closing.
  assert(inferNextPhase(mk(10)) !== 'closing', '10 weak/default turns must not auto-close');
  assert(inferNextPhase(mk(10, 7)) === 'closing', 'sustained high-quality turns may reach closing');

  const lowQuality = mk(8).map(message => ({ ...message, meta: { ...message.meta, argumentQuality: {
    score: 1, issue: false, rule: false, facts: false, application: false, remedy: false, respondsToOpponent: false, nextStep: 'Add substance.',
  } }}));
  assert(inferNextPhase(lowQuality) === 'issue_framing', 'weak arguments should not skip foundational phase work');
}

// Ruling text parse (trusted Court text only by convention)
assert(detectObjectionOutcome('Objection is Sustained.') === 'sustained', 'detect sustained');
assert(detectObjectionOutcome('Overruled.') === 'overruled', 'detect overruled');
assert(detectObjectionOutcome('The Court reserves.') === 'reserved', 'detect reserved');
assert(detectObjectionOutcome('The submission is not sustained as framed.') === 'reserved', 'not sustained stays reserved');

// Dimension formatter is UI-safe (no em dashes)
{
  const line = formatScoreDimensions(DEFAULT_SCORE_BREAKDOWN);
  assert(line.includes('Engagement'), line);
  assert(!line.includes('—'), 'no em dash in dimension labels');
}

console.log('trialScoring tests passed');
