// API security regression tests: session ownership, cron auth, and IP parsing.
//
// These call the real handlers with mock req/res objects (no server needed).
// Run: npx tsx services/apiSecurity.test.ts
import assert from 'node:assert/strict';

process.env.LEXFORGE_SESSION_SECRET = 'test-session-secret-0123456789abcdef';
delete process.env.CRON_SECRET;

import lexforgeHandler from '../api/lexforge.js';
import cronHandler from '../api/cron.js';
import keysHandler from '../api/keys.js';
import schedulesHandler from '../api/_lib/cron/schedules.js';
import drillsCron from '../api/_lib/cron/drills.js';
import dueCron from '../api/_lib/cron/due.js';
import { clientIp } from '../api/_lib/security.js';
import { issueSession, verifySession } from '../api/_lib/session.js';
import { pushBounded, trimOwner } from '../api/_lib/boundedStore.js';

type Req = { method: string; headers: Record<string, string>; query: Record<string, unknown>; body?: unknown; socket?: { remoteAddress?: string } };
type Res = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  status: (code: number) => Res;
  json: (body: any) => Res;
  end: () => Res;
  setHeader: (key: string, value: string) => void;
};

function mockReq(partial: Partial<Req> = {}): Req {
  return { method: 'GET', headers: {}, query: {}, ...partial };
}

function mockRes(): Res {
  const res: Res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  };
  return res;
}

async function call(handler: any, req: Req, res = mockRes()): Promise<Res> {
  await handler(req, res);
  return res;
}

async function mint(): Promise<{ token: string; owner: string }> {
  const res = await call(lexforgeHandler, mockReq({ method: 'POST', query: { fn: 'session' } }));
  assert.equal(res.statusCode, 201, 'session mint returns 201');
  assert.equal(typeof res.body?.token, 'string');
  assert.match(res.body.token, /^v1\./);
  return { token: res.body.token, owner: res.body.owner };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

// 1. Session token round-trip, tamper, expiry.
{
  const session = issueSession();
  assert.equal(verifySession(session.token)?.owner, session.owner, 'valid token verifies');
  const tampered = `${session.token.slice(0, -1)}${session.token.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifySession(tampered), null, 'tampered token rejected');
  assert.equal(verifySession(session.token, session.expiresAt + 1), null, 'expired token rejected');
  assert.equal(verifySession('not-a-token'), null, 'garbage token rejected');
}

// 2. Scores: a raw bearer string is no longer an owner id.
{
  const unauthenticated = await call(lexforgeHandler, mockReq({ query: { fn: 'scores' } }));
  assert.equal(unauthenticated.statusCode, 401, 'scores requires a session');

  const forged = await call(
    lexforgeHandler,
    mockReq({ query: { fn: 'scores' }, headers: auth('victim-owner') }),
  );
  assert.equal(forged.statusCode, 401, 'raw bearer no longer authenticates');

  const a = await mint();
  const b = await mint();
  assert.notEqual(a.owner, b.owner, 'sessions get distinct owners');

  const write = await call(lexforgeHandler, mockReq({
    method: 'POST',
    query: { fn: 'scores' },
    headers: auth(a.token),
    body: { session_id: 's1', drill_id: 'd1', points: 8 },
  }));
  assert.equal(write.statusCode, 201, 'owner A writes a score');
  assert.equal(write.body.score.owner, a.owner);

  const readA = await call(lexforgeHandler, mockReq({ query: { fn: 'scores' }, headers: auth(a.token) }));
  assert.equal(readA.body.scores.length, 1, 'owner A reads own row');

  const readB = await call(lexforgeHandler, mockReq({ query: { fn: 'scores' }, headers: auth(b.token) }));
  assert.equal(readB.body.scores.length, 0, 'owner B cannot read A row');

  const oversized = await call(lexforgeHandler, mockReq({
    method: 'POST',
    query: { fn: 'scores' },
    headers: auth(a.token),
    body: { session_id: 'x'.repeat(200), drill_id: 'd1', points: 1 },
  }));
  assert.equal(oversized.statusCode, 400, 'oversized ids rejected');
}

// 3. Keys: session scoping; x-user-id no longer impersonates.
{
  const a = await mint();
  const b = await mint();

  const saved = await call(keysHandler, mockReq({
    method: 'POST',
    headers: auth(a.token),
    body: { provider: 'deepseek', key: 'sk-test-123456' },
  }));
  assert.equal(saved.statusCode, 201, 'owner A saves key metadata');

  const spoofed = await call(keysHandler, mockReq({
    headers: { ...auth(b.token), 'x-user-id': a.owner },
  }));
  assert.equal(spoofed.statusCode, 200);
  assert.equal(spoofed.body.keys.length, 0, 'x-user-id does not impersonate owner A');

  const own = await call(keysHandler, mockReq({ headers: auth(a.token) }));
  assert.equal(own.body.keys.length, 1, 'owner A sees own key');

  const deleted = await call(keysHandler, mockReq({
    method: 'DELETE',
    headers: auth(b.token),
    query: { provider: 'deepseek' },
  }));
  assert.equal(deleted.statusCode, 404, 'owner B cannot delete A key');
}

// 4. Schedules: body user_id cannot escape the session; service token can.
{
  const unauth = await call(schedulesHandler, mockReq({ query: { user_id: 'someone' } }));
  assert.equal(unauth.statusCode, 401, 'schedules require auth');

  const a = await mint();
  const b = await mint();
  const created = await call(schedulesHandler, mockReq({
    method: 'POST',
    headers: auth(a.token),
    body: { user_id: 'victim', kind: 'drill', schedule: { kind: 'cron', expr: '0 9 * * *' } },
  }));
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.schedule.user_id, a.owner, 'session owner wins over body user_id');

  const crossRead = await call(schedulesHandler, mockReq({
    headers: auth(b.token),
    query: { user_id: 'victim' },
  }));
  assert.equal(crossRead.statusCode, 200);
  assert.equal(crossRead.body.schedules.length, 0, 'foreign user_id cannot read A schedules');

  const own = await call(schedulesHandler, mockReq({ headers: auth(a.token), query: { user_id: a.owner } }));
  assert.equal(own.statusCode, 200);
  assert.equal(own.body.schedules.length, 1, 'owner reads own schedule');

  process.env.CRON_SECRET = 'cron-secret-test';
  const service = await call(schedulesHandler, mockReq({
    headers: auth('cron-secret-test'),
    query: { user_id: a.owner },
  }));
  assert.equal(service.statusCode, 200, 'service token can read by user_id');
  assert.equal(service.body.schedules.length, 1);
  delete process.env.CRON_SECRET;
}

// 5. Cron jobs fail closed and do not accept the secret in a query string.
{
  const noSecret = await call(drillsCron, mockReq());
  assert.equal(noSecret.statusCode, 503, 'drills job fails closed without CRON_SECRET');

  process.env.CRON_SECRET = 'cron-secret-test';
  const noAuth = await call(drillsCron, mockReq());
  assert.equal(noAuth.statusCode, 401, 'drills job rejects missing auth');

  const wrong = await call(drillsCron, mockReq({ headers: auth('wrong') }));
  assert.equal(wrong.statusCode, 401, 'drills job rejects wrong secret');

  const ok = await call(drillsCron, mockReq({ headers: auth('cron-secret-test') }));
  assert.equal(ok.statusCode, 200, 'drills job accepts the configured secret');

  const dueOk = await call(dueCron, mockReq({ headers: auth('cron-secret-test') }));
  assert.equal(dueOk.statusCode, 200, 'due job accepts header secret');

  const dueQuery = await call(dueCron, mockReq({ query: { secret: 'cron-secret-test' } }));
  assert.equal(dueQuery.statusCode, 401, 'due job ignores ?secret=');
  delete process.env.CRON_SECRET;
}

// 6. Rate limiter keys off the proxy-appended (rightmost) address.
{
  const req = mockReq({
    headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 10.0.0.2' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  assert.equal(clientIp(req), '10.0.0.2', 'rightmost XFF hop used');
  assert.equal(
    clientIp(mockReq({ headers: { 'x-real-ip': '198.51.100.7' } })),
    '198.51.100.7',
    'x-real-ip fallback',
  );
}

// 7. Bounded stores evict oldest entries.
{
  const rows: any[] = [];
  for (let i = 0; i < 5; i += 1) pushBounded(rows, { id: i }, 3);
  assert.deepEqual(rows.map((r) => r.id), [2, 3, 4], 'pushBounded keeps newest');

  const owned = [{ owner: 'a', id: 1 }, { owner: 'b', id: 2 }, { owner: 'a', id: 3 }, { owner: 'a', id: 4 }];
  trimOwner(owned, 'a', 2);
  assert.deepEqual(owned.map((r) => `${r.owner}${r.id}`), ['b2', 'a3', 'a4'], 'trimOwner keeps newest per owner');
}

// 8. Dispatchers only resolve own properties (no prototype-chain handlers).
{
  const lexProto = await call(lexforgeHandler, mockReq({ query: { fn: 'constructor' } }));
  assert.equal(lexProto.statusCode, 404, 'lexforge rejects prototype keys');

  const cronProto = await call(cronHandler, mockReq({ query: { job: 'toString' } }));
  assert.equal(cronProto.statusCode, 404, 'cron rejects prototype keys');
}

console.log('apiSecurity passed (8/8)');
