import {
  analysisSourceLabel,
  buildDraftMarkdown,
  buildScorecardMarkdown,
  buildTranscriptMarkdown,
  detectAnalysisSource,
  draftFilename,
  formatEnumLabel,
  formatPracticeMode,
  formatTranscriptBody,
  scorecardFilename,
  transcriptFilename,
} from './exportService';
import { createSessionRecord } from './testFixtures';
import { ChatMessage } from '../types';

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

function assertNotIncludes(value: string, unexpected: string, label: string) {
  if (value.includes(unexpected)) {
    throw new Error(`${label}: expected output NOT to include ${JSON.stringify(unexpected)}\nActual:\n${value}`);
  }
}

function testScorecardIncludesSessionAndPerformanceDetails() {
  const record = createSessionRecord();
  const markdown = buildScorecardMarkdown(record);

  assertIncludes(markdown, '# LexForge Scorecard', 'scorecard title');
  assertIncludes(markdown, '7.5/10', 'overall score');
  assertIncludes(markdown, 'analysis scale 0–10', 'analysis scale label');
  assertIncludes(markdown, '- Mode: Indian', 'practice mode title-cased');
  assertIncludes(markdown, '- Case: Acme v. Sterling Bank', 'case title');
  assertIncludes(markdown, '- Judge: Justice Robert Vance', 'judge name');
  assertIncludes(markdown, '- Opposing counsel: Aranya Vasishtha', 'opposing counsel name');
  assertIncludes(markdown, '- Argument strength: 8', 'argument score');
  assertIncludes(markdown, 'Strong issue framing with room to tighten precedent use.', 'feedback');
  assertIncludes(markdown, '- Use one controlling precedent earlier', 'improvement area');
  assertIncludes(markdown, '## Live courtroom structure (0–200)', 'live section heading');
  assertIncludes(markdown, '- Total: 36/200', 'live total');
  assertIncludes(markdown, '## Analysis scores (0–10)', 'analysis section heading');
  assertIncludes(markdown, 'Analysis source: AI coaching analysis', 'AI source stamp');
  assertIncludes(markdown, '- Duration: 20 minutes', 'duration from fixture');
  assertIncludes(markdown, '- Session type: Quick', 'session type label');
  assertIncludes(
    markdown,
    'Live structure scores advocacy activity during the hearing',
    'scale reconciliation note',
  );
}

function testScorecardFallsBackWhenAnalysisIsMissing() {
  const record = createSessionRecord({ performance: undefined });
  const markdown = buildScorecardMarkdown(record);

  assertIncludes(markdown, 'Live courtroom structure **36/200**', 'live score fallback headline');
  assertIncludes(markdown, '- Argument strength: N/A', 'missing argument score');
  assertIncludes(
    markdown,
    'Performance analysis was not available, but the transcript remains exportable.',
    'missing feedback fallback',
  );
  assertIncludes(
    markdown,
    '- No improvement areas were generated for this session.',
    'missing improvement fallback',
  );
}

function testScorecardStampsLocalCoachingSource() {
  const record = createSessionRecord({
    performance: {
      argumentStrength: 6,
      precedentUsage: 5,
      legalGrounding: 6,
      responseQuality: 5,
      objectionHandling: 5,
      courtroomPresence: 6,
      overallScore: 5.5,
      feedback:
        'Local coaching summary: your arguments averaged 6/10 for advocacy structure. Make the opposing position explicit, then answer it.',
      improvementAreas: ['Name a governing rule or authority, then verify it against a primary source.'],
    },
    analysisStatus: { state: 'ready' },
  });
  const markdown = buildScorecardMarkdown(record);
  assertEqual(detectAnalysisSource(record), 'local', 'detect local from feedback prefix');
  assertIncludes(
    markdown,
    'Analysis source: Local coaching fallback (not AI)',
    'local source stamp on scorecard',
  );
  assertNotIncludes(markdown, 'Analysis source: AI coaching analysis', 'must not claim AI for local');
}

function testScorecardRespectsExplicitSource() {
  const record = createSessionRecord({
    analysisStatus: { state: 'ready', source: 'local' },
    performance: {
      argumentStrength: 8,
      precedentUsage: 7,
      legalGrounding: 8,
      responseQuality: 7,
      objectionHandling: 6,
      courtroomPresence: 8,
      overallScore: 7.5,
      feedback: 'Looks like a normal AI summary without the local prefix.',
      improvementAreas: [],
    },
  });
  assertEqual(detectAnalysisSource(record), 'local', 'explicit source wins over feedback');
  assertEqual(analysisSourceLabel('pending'), 'Pending', 'pending label');
  assertEqual(analysisSourceLabel('unavailable'), 'Unavailable', 'unavailable label');
}

function testTranscriptUsesParticipantNamesAndMessageText() {
  const markdown = buildTranscriptMarkdown(createSessionRecord());

  assertIncludes(markdown, '# LexForge Transcript', 'transcript title');
  assertIncludes(markdown, 'Case: Acme v. Sterling Bank', 'transcript case title');
  assertIncludes(markdown, 'Mode: Indian', 'transcript mode');
  assertIncludes(markdown, '### You', 'user label');
  assertIncludes(markdown, '### Justice Robert Vance', 'judge label');
  assertIncludes(markdown, '### Aranya Vasishtha', 'opposing counsel label');
  assertIncludes(markdown, 'My submission is that notice failed under the contract.', 'user message');
  assertIncludes(markdown, 'Address the damages question directly.', 'judge message');
  assertIncludes(markdown, 'The bank complied with the notice clause.', 'opposing counsel message');
  assertIncludes(markdown, '3 messages exported from LexForge', 'message count footer');
}

function testTranscriptFormatsObjectionsAndRulings() {
  const objection: ChatMessage = {
    id: 'obj-1',
    sender: 'user',
    text: '[OBJECTION] Grounds: relevance\nBasis: The witness is being asked to speculate. (Quick Objection Reflex)',
    timestamp: new Date('2026-07-08T09:03:00.000Z'),
    meta: {
      kind: 'objection',
      phase: 'rebuttal',
      objection: {
        grounds: 'relevance',
        basis: 'The witness is being asked to speculate.',
        wasQuick: true,
        outcome: 'sustained',
      },
    },
  };
  const ruling: ChatMessage = {
    id: 'rul-1',
    sender: 'judge',
    text: 'Objection sustained. Counsel will rephrase.',
    timestamp: new Date('2026-07-08T09:03:30.000Z'),
    meta: { kind: 'ruling', phase: 'rebuttal' },
  };
  const system: ChatMessage = {
    id: 'sys-1',
    sender: 'system',
    text: 'Hearing opened.',
    timestamp: new Date('2026-07-08T08:59:00.000Z'),
    meta: { kind: 'system' },
  };

  const record = createSessionRecord({
    transcript: [system, ...createSessionRecord().transcript, objection, ruling],
  });
  const markdown = buildTranscriptMarkdown(record);

  assertIncludes(markdown, '### You (objection)', 'objection speaker label');
  assertIncludes(markdown, '**Objection**', 'objection heading');
  assertIncludes(markdown, '- Grounds: relevance', 'objection grounds');
  assertIncludes(markdown, '- Basis: The witness is being asked to speculate.', 'objection basis');
  assertIncludes(markdown, '- Outcome: Sustained', 'objection outcome');
  assertIncludes(markdown, 'quick reflex', 'quick flag');
  assertIncludes(markdown, '### Justice Robert Vance (ruling)', 'ruling speaker');
  assertIncludes(markdown, '**Ruling**', 'ruling heading');
  assertIncludes(markdown, 'Objection sustained. Counsel will rephrase.', 'ruling body');
  assertIncludes(markdown, '_Hearing opened._', 'system italicized');
  assertIncludes(markdown, 'Rebuttal', 'phase label on line');

  // Body helper without full record
  const bodyOnly = formatTranscriptBody({
    id: 'x',
    sender: 'user',
    text: '[OBJECTION] hearsay: Out of court statement offered for truth',
    timestamp: new Date(),
  });
  assertIncludes(bodyOnly, '- Grounds: hearsay', 'parse alternate objection form grounds');
  assertIncludes(bodyOnly, 'Out of court statement offered for truth', 'parse alternate form basis');
}

function testFilenamesAreSanitized() {
  const record = createSessionRecord();

  // Filenames include a short session id suffix so same-case exports do not collide.
  assertEqual(
    scorecardFilename(record),
    'acme-v-sterling-bank-session-test-1-scorecard.md',
    'scorecard filename',
  );
  assertEqual(
    transcriptFilename(record),
    'acme-v-sterling-bank-session-test-1-transcript.md',
    'transcript filename',
  );
}

function testExportGuardsMissingOptionalFields() {
  const record = createSessionRecord({
    performance: undefined,
    scoreBreakdown: undefined,
    endTime: undefined,
    durationMinutes: undefined,
    transcript: [],
  });
  const markdown = buildScorecardMarkdown(record);
  assertIncludes(markdown, 'Live courtroom score unavailable', 'missing score fallback');
  assertIncludes(markdown, 'Ended: Unknown', 'missing end time');
  const transcript = buildTranscriptMarkdown(record);
  assertIncludes(transcript, 'Case: Acme v. Sterling Bank', 'transcript still has case title');
  assertIncludes(transcript, '_No transcript lines were recorded for this session._', 'empty transcript');
}

function testDraftExportIncludesFactsAndDraft() {
  const markdown = buildDraftMarkdown({
    title: 'Plaint // Sample',
    documentType: 'Plaint',
    practiceMode: 'indian',
    objective: 'Plead a clean cause of action',
    facts: 'Buyer failed to pay for goods delivered on 1 Jan.',
    draft: 'IN THE COURT OF ...',
    feedback: 'Add a prayer for relief.',
    notes: 'Filing deadline next week.',
  });

  assertIncludes(markdown, '# LexForge Draft', 'draft title');
  assertIncludes(markdown, '- Title: Plaint // Sample', 'instrument title');
  assertIncludes(markdown, '- Type: Plaint', 'document type');
  assertIncludes(markdown, '- Mode: Indian', 'mode title-cased');
  assertIncludes(markdown, '- Objective: Plead a clean cause of action', 'objective');
  assertIncludes(markdown, 'Buyer failed to pay', 'facts');
  assertIncludes(markdown, 'IN THE COURT OF', 'draft body');
  assertIncludes(markdown, 'Add a prayer for relief.', 'feedback');
  assertIncludes(markdown, '## Notes', 'notes section');
  assertIncludes(markdown, 'Filing deadline next week.', 'notes body');
  assertIncludes(markdown, '- Word count:', 'word count meta');
  assertEqual(draftFilename('Plaint // Sample'), 'plaint-sample-draft.md', 'draft filename');
}

function testDraftExportEmptyFallbacks() {
  const markdown = buildDraftMarkdown({
    title: '',
    documentType: '',
    practiceMode: '',
    draft: '   ',
  });
  assertIncludes(markdown, 'Untitled draft', 'empty title fallback');
  assertIncludes(markdown, 'Scenario facts were not generated.', 'missing facts fallback');
  assertIncludes(markdown, '_Empty draft_', 'empty draft fallback');
  assertIncludes(markdown, '- Mode: Unknown', 'empty mode fallback');
  assertNotIncludes(markdown, '- Word count:', 'no word count for empty draft');
}

function testFormatHelpers() {
  assertEqual(formatPracticeMode('indian'), 'Indian', 'indian mode');
  assertEqual(formatPracticeMode('international'), 'International', 'intl mode');
  assertEqual(formatPracticeMode(''), 'Unknown', 'empty mode');
  assertEqual(formatEnumLabel('issue_framing'), 'Issue Framing', 'phase enum');
  assertEqual(formatEnumLabel(null), 'Unknown', 'null enum');
  assertEqual(detectAnalysisSource(undefined), 'unknown', 'null record source');
  assertEqual(
    detectAnalysisSource(createSessionRecord({ analysisStatus: { state: 'pending' }, performance: undefined })),
    'pending',
    'pending without metrics',
  );
  assertEqual(
    detectAnalysisSource(
      createSessionRecord({ analysisStatus: { state: 'unavailable' }, performance: undefined }),
    ),
    'unavailable',
    'unavailable state',
  );
}

testScorecardIncludesSessionAndPerformanceDetails();
testScorecardFallsBackWhenAnalysisIsMissing();
testScorecardStampsLocalCoachingSource();
testScorecardRespectsExplicitSource();
testTranscriptUsesParticipantNamesAndMessageText();
testTranscriptFormatsObjectionsAndRulings();
testFilenamesAreSanitized();
testExportGuardsMissingOptionalFields();
testDraftExportIncludesFactsAndDraft();
testDraftExportEmptyFallbacks();
testFormatHelpers();

console.log('exportService tests passed');
