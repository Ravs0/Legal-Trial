import assert from 'node:assert/strict';
import { CASES } from '../constants';
import { CaseDifficulty, SessionType } from '../types';
import { createDemoSessionSettings } from './demoSessionService';

const session = createDemoSessionSettings();

assert.equal(session.practiceMode, 'indian');
assert.equal(session.sessionType, SessionType.QUICK);
assert.equal(session.difficulty, CaseDifficulty.BEGINNER);
assert.equal(session.caseDetail.id, CASES.find(caseDetail => caseDetail.difficulty === CaseDifficulty.BEGINNER)?.id);

console.log('demoSessionService tests passed');
