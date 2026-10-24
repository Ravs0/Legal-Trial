// Read-only deployment checks. These requests never invoke a model, submit
// personal data, or modify application state. Run separately from local CI:
//   npm run smoke:deployment -- https://legal-trial.vercel.app

const input = process.argv[2] || process.env.LEXFORGE_DEPLOYMENT_URL;
let base;
try {
  base = new URL(input);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) throw new Error();
} catch {
  console.error('Usage: npm run smoke:deployment -- https://<deployment-host>');
  process.exit(1);
}

const errorBody = (body) => typeof body?.error === 'string';
const checks = [
  { path: '/', status: 200, html: true },
  { path: '/api/chat', status: 405, validate: errorBody },
  { path: '/api/voice', status: 405, validate: errorBody },
  { path: '/api/search', status: 405, validate: errorBody },
  { path: '/api/caselaw', status: 405, validate: errorBody },
  {
    path: '/api/dreadler', status: 200,
    validate: (body) => Array.isArray(body?.worlds) && body.worlds.length > 0
      && Array.isArray(body.skins) && body.skins.length > 0,
  },
  {
    path: '/api/court-data/search?q=supreme%20court&limit=1', status: 200,
    validate: (body) => Array.isArray(body?.records) && body.records.length > 0
      && Array.isArray(body.sources) && Array.isArray(body.warnings),
  },
  { path: '/api/lexforge/drills', status: 401, validate: errorBody },
  { path: '/api/lexforge/chain', status: 405, validate: errorBody },
  { path: '/api/lexforge/jev-decide', status: 405, validate: errorBody },
];

async function check({ path, status, html, validate }) {
  try {
    const response = await fetch(new URL(path, base), {
      headers: { Origin: base.origin },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== status) throw new Error(`HTTP ${response.status}; expected ${status}`);
    const type = response.headers.get('content-type') || '';
    if (html) {
      if (!type.includes('text/html') || !/<title>[^<]*LexForge/i.test(await response.text())) {
        throw new Error('expected the LexForge HTML entry point');
      }
    } else {
      if (!type.includes('application/json')) throw new Error('expected JSON, received ' + type);
      if (!validate(await response.json())) throw new Error('unexpected response shape');
    }
    return { ok: true, message: `PASS ${path} (${status})` };
  } catch (error) {
    return { ok: false, message: `FAIL ${path}: ${error.message}` };
  }
}

console.log(`Checking ${base.origin} (read-only; no model calls)`);
const results = await Promise.all(checks.map(check));
for (const result of results) console.log(result.message);
const passed = results.filter((result) => result.ok).length;
console.log(`${passed}/${checks.length} deployment checks passed.`);
if (passed !== checks.length) process.exitCode = 1;
