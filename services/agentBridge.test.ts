// Run: npx tsx services/agentBridge.test.ts
// Contract tests for the Open Instinct bridge (api/_lib/lexforge/agent.js).
import assert from 'node:assert/strict';
import agent, { MIN_WORDS, REPLY_MAX, learnerToken, nextDrill, scoreAnswer } from '../api/_lib/lexforge/agent.js';
import { AGENT_DRILLS } from '../api/_lib/lexforge/agentDrills.js';
import { DISCLAIMER } from '../api/_lib/guardrails.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  PASS  ${name}`);
      passed += 1;
    })
    .catch((e: unknown) => {
      console.log(`  FAIL  ${name}: ${(e as Error).message}`);
      failed += 1;
    });
}

type Out = { status: number; body: any; headers: Record<string, string> };

let ip = 0;
async function call(body: unknown, { key = 'test-agent-key', method = 'POST', query = {} as Record<string, string> } = {}): Promise<Out> {
  ip += 1; // fresh client per call so the per-IP rate limit never interferes
  const out: Out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader(k: string, v: string) { out.headers[k] = v; },
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
  };
  const headers: Record<string, string> = { 'x-forwarded-for': `10.0.0.${ip}` };
  if (key) headers.authorization = `Bearer ${key}`;
  await agent({ method, headers, body, query }, res);
  return out;
}

const STRONG =
  'My Lord, the petitioner seeks bail because custody serves no purpose. The issue is whether detention is necessary; ' +
  'the rule is that bail is the norm. Given that he has no record, it follows that he is no flight risk. ' +
  'In Sanjay Chandra v. CBI the Supreme Court held that seriousness alone does not justify custody. ' +
  'However, the prosecution says witnesses may be influenced; we distinguish that, as all witnesses are already examined. ' +
  'Therefore we offer surety and weekly reporting.';

process.env.LEXFORGE_AGENT_KEY = 'test-agent-key';

await test('missing env key returns 503', async () => {
  delete process.env.LEXFORGE_AGENT_KEY;
  const r = await call({ action: 'drill', learner: 'a' });
  process.env.LEXFORGE_AGENT_KEY = 'test-agent-key';
  assert.equal(r.status, 503);
});

await test('wrong or missing key returns 401', async () => {
  assert.equal((await call({ action: 'drill', learner: 'a' }, { key: 'nope' })).status, 401);
  assert.equal((await call({ action: 'drill', learner: 'a' }, { key: '' })).status, 401);
});

await test('other methods return 405', async () => {
  const r = await call({}, { method: 'PUT' });
  assert.equal(r.status, 405);
  assert.equal(r.headers.Allow, 'GET, POST');
});

const get = (query: Record<string, string>) => call(undefined, { method: 'GET', key: '', query });

await test('GET needs a valid learner token', async () => {
  assert.equal((await get({ action: 'drill' })).status, 401);
  assert.equal((await get({ action: 'drill', t: 'alice.forged' })).status, 401);
  const token = learnerToken('alice');
  assert.equal((await get({ action: 'drill', t: token.replace('alice', 'bob') })).status, 401);
  assert.equal((await get({ action: 'drill', t: token })).status, 200);
});

await test('token is bound to the key and the learner id format', () => {
  assert.notEqual(learnerToken('alice', 'k1'), learnerToken('alice', 'k2'));
  assert.throws(() => learnerToken('+14155550100'));
  assert.throws(() => learnerToken('a@b.com'));
});

await test('GET token runs the full drill loop for its own learner', async () => {
  const t = learnerToken('get-loop');
  const d = await get({ action: 'drill', t, mode: 'indian' });
  const a = await get({ action: 'answer', t, drill_id: d.body.drill.id, text: STRONG });
  assert.ok(a.body.score > 0);
  assert.equal((await get({ action: 'progress', t })).body.attempts, 1);
  assert.equal((await call({ action: 'progress', learner: 'get-loop' })).body.attempts, 1);
});

await test('rejects unknown action and missing learner', async () => {
  assert.equal((await call({ action: 'hack', learner: 'a' })).status, 400);
  assert.equal((await call({ action: 'drill' })).status, 400);
  assert.equal((await call({ action: 'drill', learner: '   ' })).status, 400);
});

await test('drill returns a prompt for the requested mode', async () => {
  const r = await call({ action: 'drill', learner: 'drill-mode', mode: 'international' });
  assert.equal(r.status, 200);
  assert.equal(r.body.drill.mode, 'international');
  assert.ok(r.body.reply.includes(r.body.drill.prompt));
  assert.ok(r.body.reply.length <= REPLY_MAX);
});

await test('every drill reply fits in one text', () => {
  for (const d of AGENT_DRILLS) assert.ok(`Drill (use of authority): ${d.prompt} Reply with your argument.`.length <= REPLY_MAX, d.id);
});

await test('short answers get a nudge, not a score', async () => {
  const r = await call({ action: 'answer', learner: 'short', drill_id: AGENT_DRILLS[0].id, text: 'He should get bail.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.score, null);
  assert.ok(r.body.reply.includes(String(MIN_WORDS)));
});

await test('answer validates drill id and text', async () => {
  assert.equal((await call({ action: 'answer', learner: 'v', drill_id: 'nope', text: STRONG })).status, 400);
  assert.equal((await call({ action: 'answer', learner: 'v', drill_id: AGENT_DRILLS[0].id, text: 42 })).status, 400);
});

await test('answer scores, gives feedback and carries the disclaimer', async () => {
  const r = await call({ action: 'answer', learner: 'scored', drill_id: AGENT_DRILLS[0].id, text: STRONG });
  assert.equal(r.status, 200);
  assert.ok(r.body.score >= 0 && r.body.score <= 100);
  assert.deepEqual(Object.keys(r.body.dimensions).sort(), ['authority', 'clarity', 'delivery', 'reasoning', 'rebuttal']);
  assert.equal(r.body.feedback.length, 2);
  assert.ok(r.body.reply.endsWith(DISCLAIMER));
  assert.ok(r.body.reply.length <= REPLY_MAX);
});

await test('a reasoned, cited answer outscores a bare one', () => {
  const bare = 'He is a good person and he should get bail now please because he did nothing at all wrong in this matter ok';
  assert.ok(scoreAnswer(STRONG).score > scoreAnswer(bare).score);
});

await test('next drill skips attempted drills, then targets the weakest area', async () => {
  const learner = 'cycle';
  const indian = AGENT_DRILLS.filter((d) => d.mode === 'indian');
  for (const d of indian) {
    assert.equal(nextDrill(learner, 'indian').id, d.id);
    await call({ action: 'answer', learner, drill_id: d.id, text: STRONG });
  }
  const weak = (await call({ action: 'progress', learner })).body.weakest;
  assert.equal(nextDrill(learner, 'indian').skill, weak);
});

await test('progress summarises attempts', async () => {
  const empty = await call({ action: 'progress', learner: 'nobody' });
  assert.equal(empty.body.attempts, 0);
  assert.ok(empty.body.reply.includes('drill'));
  const learner = 'progress';
  await call({ action: 'answer', learner, drill_id: AGENT_DRILLS[0].id, text: STRONG });
  await call({ action: 'answer', learner, drill_id: AGENT_DRILLS[1].id, text: STRONG });
  const r = await call({ action: 'progress', learner });
  assert.equal(r.body.attempts, 2);
  assert.ok(r.body.best >= r.body.average);
  assert.ok(r.body.reply.length <= REPLY_MAX);
});

await test('learners are isolated', async () => {
  await call({ action: 'answer', learner: 'iso-a', drill_id: AGENT_DRILLS[0].id, text: STRONG });
  assert.equal((await call({ action: 'progress', learner: 'iso-b' })).body.attempts, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
