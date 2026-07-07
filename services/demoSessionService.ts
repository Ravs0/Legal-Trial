import {
  CASES,
  JUDGE_PERSONALITIES,
  OPPOSING_COUNSEL_PERSONALITIES,
} from '../constants';
import { CaseDifficulty, SessionSettings, SessionType } from '../types';

export const createDemoSessionSettings = (): SessionSettings => {
  const demoCase = CASES.find(c => c.difficulty === CaseDifficulty.BEGINNER) || CASES[0];
  const demoJudge = JUDGE_PERSONALITIES[0];
  const demoCounsel = OPPOSING_COUNSEL_PERSONALITIES[0];

  if (!demoCase || !demoJudge || !demoCounsel) {
    throw new Error('Demo session cannot start because Indian practice data is incomplete.');
  }

  return {
    caseDetail: demoCase,
    judgePersonality: demoJudge,
    opposingCounselPersonality: demoCounsel,
    sessionType: SessionType.QUICK,
    difficulty: demoCase.difficulty,
    practiceMode: 'indian',
  };
};
