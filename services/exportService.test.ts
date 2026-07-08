import {
  buildScorecardMarkdown,
  buildTranscriptMarkdown,
  scorecardFilename,
  transcriptFilename,
} from './exportService';
import { createSessionRecord } from './testFixtures';

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected output to include ${JSON.stringify(expected)}\nActual:\n${value}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testScorecardIncludesSessionAndPerformanceDetails() {
  const record = createSessionRecord();
  const markdown = buildScorecardMarkdown(record);

  assertIncludes(markdown, '# LexForge Scorecard', 'scorecard title');
  assertIncludes(markdown, '7.5/10 overall', 'overall score');
  assertIncludes(markdown, '- Mode: indian', 'practice mode');
  assertIncludes(markdown, '- Case: Acme v. Sterling Bank', 'case title');
  assertIncludes(markdown, '- Judge: Justice Robert Vance', 'judge name');
  assertIncludes(markdown, '- Opposing counsel: Aranya Vasishtha', 'opposing counsel name');
  assertIncludes(markdown, '- Argument strength: 8', 'argument score');
  assertIncludes(markdown, 'Strong issue framing with room to tighten precedent use.', 'feedback');
  assertIncludes(markdown, '- Use one controlling precedent earlier', 'improvement area');
}

function testScorecardFallsBackWhenAnalysisIsMissing() {
  const record = createSessionRecord({ performance: undefined });
  const markdown = buildScorecardMarkdown(record);

  assertIncludes(markdown, 'Live courtroom score 36', 'live score fallback');
  assertIncludes(markdown, '- Argument strength: N/A', 'missing argument score');
  assertIncludes(markdown, 'Performance analysis was not available, but the transcript remains exportable.', 'missing feedback fallback');
  assertIncludes(markdown, '- No improvement areas were generated for this session.', 'missing improvement fallback');
}

function testTranscriptUsesParticipantNamesAndMessageText() {
  const markdown = buildTranscriptMarkdown(createSessionRecord());

  assertIncludes(markdown, '# LexForge Transcript', 'transcript title');
  assertIncludes(markdown, 'Case: Acme v. Sterling Bank', 'transcript case title');
  assertIncludes(markdown, '### You', 'user label');
  assertIncludes(markdown, '### Justice Robert Vance', 'judge label');
  assertIncludes(markdown, '### Aranya Vasishtha', 'opposing counsel label');
  assertIncludes(markdown, 'My submission is that notice failed under the contract.', 'user message');
  assertIncludes(markdown, 'Address the damages question directly.', 'judge message');
  assertIncludes(markdown, 'The bank complied with the notice clause.', 'opposing counsel message');
}

function testFilenamesAreSanitized() {
  const record = createSessionRecord();

  assertEqual(scorecardFilename(record), 'acme-v-sterling-bank-scorecard.md', 'scorecard filename');
  assertEqual(transcriptFilename(record), 'acme-v-sterling-bank-transcript.md', 'transcript filename');
}

testScorecardIncludesSessionAndPerformanceDetails();
testScorecardFallsBackWhenAnalysisIsMissing();
testTranscriptUsesParticipantNamesAndMessageText();
testFilenamesAreSanitized();

console.log('exportService tests passed');
