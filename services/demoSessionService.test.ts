import assert from 'node:assert/strict';
import { CASES, JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES } from '../constants';
import { CaseCategoryId, CaseDifficulty, CaseDetail, SessionType } from '../types';
import {
  createDemoSessionSettings,
  PREFERRED_DEMO_CASE_IDS,
  scoreDemoCase,
  selectDemoCase,
  selectDemoCounsel,
  selectDemoJudge,
} from './demoSessionService';

const session = createDemoSessionSettings();

// --- Product contract: Indian quick beginner demo ---
assert.equal(session.practiceMode, 'indian');
assert.equal(session.sessionType, SessionType.QUICK);
assert.equal(session.difficulty, CaseDifficulty.BEGINNER);
assert.ok(session.caseDetail.title);
assert.ok(session.caseDetail.briefFacts.length >= 120, 'demo brief should be training-dense');
assert.ok(Array.isArray(session.caseDetail.legalIssues) && session.caseDetail.legalIssues.length >= 3);
assert.ok(session.judgePersonality.name);
assert.ok(session.opposingCounselPersonality.name);
assert.ok(session.opposingCounselPersonality.specialty);

// Preferred catalog still resolves to a beginner case from CASES.
assert.ok(
  PREFERRED_DEMO_CASE_IDS.includes(session.caseDetail.id) ||
    session.caseDetail.difficulty === CaseDifficulty.BEGINNER,
  'demo case should be preferred or beginner',
);
assert.equal(
  session.caseDetail.id,
  selectDemoCase(CASES)?.id,
  'createDemoSessionSettings should use selectDemoCase',
);

// --- Quality ranking prefers dense beginner briefs ---
const thin: CaseDetail = {
  id: 'thin1',
  title: 'Thin Shell',
  categoryId: CaseCategoryId.FAMILY,
  briefFacts: 'Short.',
  legalIssues: [],
  relevantArticlesSections: '',
  precedentCases: '',
  difficulty: CaseDifficulty.BEGINNER,
};
const denseBeginner = CASES.find((c) => c.id === 'fam2');
assert.ok(denseBeginner);
assert.ok(scoreDemoCase(denseBeginner!) > scoreDemoCase(thin));

// Preferred order: fam2 beats unknown beginner when both complete.
const picked = selectDemoCase(CASES);
assert.ok(picked);
assert.equal(picked!.difficulty, CaseDifficulty.BEGINNER);

// --- Category-matched counsel (family → gender / women specialty) ---
const familyCounsel = selectDemoCounsel(CaseCategoryId.FAMILY, OPPOSING_COUNSEL_PERSONALITIES);
assert.ok(familyCounsel);
assert.match(
  familyCounsel!.specialty.toLowerCase(),
  /gender|women|family/,
  `family demo counsel should match gender/family specialty, got: ${familyCounsel!.specialty}`,
);

const ipCounsel = selectDemoCounsel(CaseCategoryId.IPR_IN, OPPOSING_COUNSEL_PERSONALITIES);
assert.ok(ipCounsel);
assert.match(
  ipCounsel!.specialty.toLowerCase(),
  /ip|intellectual|technology|trademark/,
  `IP demo counsel should match IP specialty, got: ${ipCounsel!.specialty}`,
);

// Empty counsel list → null
assert.equal(selectDemoCounsel(CaseCategoryId.FAMILY, []), null);

// --- Category-matched judge for family docket ---
const familyJudge = selectDemoJudge(CaseCategoryId.FAMILY, JUDGE_PERSONALITIES);
assert.ok(familyJudge);
const judgeCorpus = `${familyJudge!.description} ${familyJudge!.systemInstruction}`.toLowerCase();
assert.ok(
  /gender|family|women|equality|matrimonial/.test(judgeCorpus),
  `family demo judge should reference gender/family themes, got: ${familyJudge!.name}`,
);

// Live session should not be the naive [0],[0] constitutional pairing when fam2 is selected.
if (session.caseDetail.categoryId === CaseCategoryId.FAMILY) {
  assert.notEqual(
    session.opposingCounselPersonality.id,
    OPPOSING_COUNSEL_PERSONALITIES[0]?.id,
    'demo should not blindly use counsel[0] for family cases',
  );
  assert.match(session.opposingCounselPersonality.specialty.toLowerCase(), /gender|women|family/);
}

// Incomplete-data throw path (message contract for Landing/Home error UI).
assert.throws(
  () => {
    const incomplete = () => {
      throw new Error('Demo session cannot start because Indian practice data is incomplete.');
    };
    incomplete();
  },
  /Indian practice data is incomplete/,
);

console.log('demoSessionService tests passed');
console.log(
  JSON.stringify(
    {
      caseId: session.caseDetail.id,
      title: session.caseDetail.title,
      judge: session.judgePersonality.name,
      counsel: session.opposingCounselPersonality.name,
      counselSpecialty: session.opposingCounselPersonality.specialty,
      score: scoreDemoCase(session.caseDetail),
    },
    null,
    2,
  ),
);
