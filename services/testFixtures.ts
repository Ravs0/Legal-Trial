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
    analysisStatus: { state: 'ready', source: 'ai' },
  };

  return {
    ...base,
    ...overrides,
    settings: overrides.settings ?? base.settings,
    transcript: overrides.transcript ?? base.transcript,
  };
}
