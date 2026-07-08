# LexForge Reliability Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable TypeScript, test, build, and combined verification gates for LexForge, with deterministic service tests for scoring and export Markdown.

**Architecture:** Keep the gate local and scriptable through `package.json`. Use focused no-framework TypeScript tests that exercise public service contracts, adding only the smallest runner dependency needed to execute `.ts` tests directly. Avoid UI, AI, serverless, and arena rewrites unless `tsc` exposes direct errors.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Node scripts, `tsx` for no-framework TypeScript test execution.

---

## File Structure

- Modify `package.json`: add `typecheck`, `test`, and `check`; add `tsx` as a dev dependency if installation confirms it is needed.
- Modify `package-lock.json`: npm-generated lockfile update if `tsx` is installed.
- Create `services/testFixtures.ts`: minimal reusable fixtures for `SessionRecord`-shaped export tests.
- Create `services/legalWritingScorer.test.ts`: no-framework tests for short input rejection, AI-tell penalty visibility, and stable result shape.
- Create `services/exportService.test.ts`: no-framework tests for scorecard and transcript Markdown contracts.
- Modify implementation files only if tests or typecheck expose a real issue.

---

### Task 1: Add Verification Scripts And Runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the TypeScript runner**

Run:

```bash
npm install --save-dev tsx
```

Expected: `package.json` contains `"tsx"` under `devDependencies`, and `package-lock.json` updates consistently.

- [ ] **Step 2: Add verification scripts**

Update the `scripts` block in `package.json` to:

```json
"scripts": {
  "dev": "vite --port 3000",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "tsx services/*.test.ts",
  "check": "npm run typecheck && npm run test && npm run build"
}
```

- [ ] **Step 3: Verify the new runner is available**

Run:

```bash
npx tsx --version
```

Expected: command prints a `tsx` version and Node version, then exits zero.

---

### Task 2: Add Export Service Contract Tests

**Files:**
- Create: `services/testFixtures.ts`
- Create: `services/exportService.test.ts`
- Modify: `services/exportService.ts` only if tests reveal a contract bug

- [ ] **Step 1: Create a reusable session fixture**

Create `services/testFixtures.ts`:

```ts
import {
  CaseCategoryId,
  CaseDifficulty,
  JudgePersonalityId,
  OpposingCounselPersonalityId,
  SessionRecord,
  SessionType,
} from '../types';

export function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const base: SessionRecord = {
    id: 'session-test-1',
    settings: {
      practiceMode: 'indian',
      sessionType: SessionType.QUICK,
      difficulty: CaseDifficulty.BEGINNER,
      caseDetail: {
        id: 'case-test-1',
        title: 'Acme v. Sterling Bank',
        categoryId: CaseCategoryId.COMMERCIAL,
        briefFacts: 'A borrower challenges a bank charge after disputed notice.',
        legalIssues: ['Whether notice was sufficient', 'Whether damages are recoverable'],
        relevantArticlesSections: 'Indian Contract Act, 1872',
        precedentCases: 'Central Bank of India v. Ravindra',
        difficulty: CaseDifficulty.BEGINNER,
      },
      judgePersonality: {
        id: JudgePersonalityId.ROBERT_VANCE,
        name: 'Justice Robert Vance',
        description: 'Measured and procedure-conscious.',
        systemInstruction: 'Test judge instruction.',
      },
      opposingCounselPersonality: {
        id: OpposingCounselPersonalityId.ARANYA_VASISHTHA,
        name: 'Aranya Vasishtha',
        specialty: 'Commercial disputes',
        description: 'Precise and tactical.',
        systemInstruction: 'Test counsel instruction.',
      },
    },
    transcript: [
      {
        id: 'message-1',
        sender: 'user',
        text: 'My submission is that notice failed under the contract.',
        timestamp: new Date('2026-07-08T09:00:00.000Z'),
      },
      {
        id: 'message-2',
        sender: 'judge',
        text: 'Address the damages question directly.',
        timestamp: new Date('2026-07-08T09:01:00.000Z'),
      },
      {
        id: 'message-3',
        sender: 'opposingCounsel',
        text: 'The bank complied with the notice clause.',
        timestamp: new Date('2026-07-08T09:02:00.000Z'),
      },
    ],
    performance: {
      argumentStrength: 8,
      precedentUsage: 7,
      legalGrounding: 8,
      responseQuality: 7,
      objectionHandling: 6,
      courtroomPresence: 8,
      overallScore: 7.5,
      feedback: 'Strong issue framing with room to tighten precedent use.',
      improvementAreas: ['Use one controlling precedent earlier', 'Answer damages before remedy'],
    },
    startTime: new Date('2026-07-08T09:00:00.000Z'),
    endTime: new Date('2026-07-08T09:20:00.000Z'),
    durationMinutes: 20,
    scoreBreakdown: {
      engagement: 8,
      advocacy: 7,
      objections: 6,
      responsiveness: 7,
      professionalism: 8,
      total: 36,
    },
    analysisStatus: { state: 'ready' },
  };

  return {
    ...base,
    ...overrides,
    settings: overrides.settings ?? base.settings,
    transcript: overrides.transcript ?? base.transcript,
  };
}
```

- [ ] **Step 2: Create export tests**

Create `services/exportService.test.ts`:

```ts
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
```

- [ ] **Step 3: Run export tests**

Run:

```bash
npx tsx services/exportService.test.ts
```

Expected: `exportService tests passed`.

---

### Task 3: Add Legal Writing Scorer Contract Tests

**Files:**
- Create: `services/legalWritingScorer.test.ts`
- Modify: `services/legalWritingScorer.ts` only if tests reveal a contract bug

- [ ] **Step 1: Create scorer tests**

Create `services/legalWritingScorer.test.ts`:

```ts
import { scoreLegalWriting } from './legalWritingScorer';

function assert(condition: boolean, label: string) {
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

function testShortDraftReturnsNull() {
  assertEqual(scoreLegalWriting('Too short.'), null, 'short draft result');
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

testShortDraftReturnsNull();
testBenchmarkLikeDraftReturnsStableShape();
testAiTellCountAndPenaltyAreVisible();

console.log('legalWritingScorer tests passed');
```

- [ ] **Step 2: Run scorer tests**

Run:

```bash
npx tsx services/legalWritingScorer.test.ts
```

Expected: `legalWritingScorer tests passed`.

---

### Task 4: Run And Fix The Full Gate

**Files:**
- Modify files only as required by failed checks.

- [ ] **Step 1: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exits zero. If it fails, fix only the reported TypeScript errors.

- [ ] **Step 2: Run tests**

Run:

```bash
npm run test
```

Expected: both service test files print their success messages and exit zero.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 4: Run combined gate**

Run:

```bash
npm run check
```

Expected: typecheck, tests, and build all succeed in sequence.

---

### Task 5: Final Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Inspect changed files**

Run:

```bash
git diff -- package.json package-lock.json services/testFixtures.ts services/exportService.test.ts services/legalWritingScorer.test.ts services/exportService.ts services/legalWritingScorer.ts
```

Expected: diff is limited to verification scripts, test files, and any minimal direct fixes required by the checks.

- [ ] **Step 2: Confirm working tree status**

Run:

```bash
git status --short
```

Expected: only intended files are modified or added.

- [ ] **Step 3: Report verification honestly**

Final report must include:

- files changed;
- commands run;
- whether each command passed;
- any command skipped and why;
- any pre-existing or unrelated working tree changes left untouched.
