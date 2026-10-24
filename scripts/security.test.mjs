import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCors } from '../api/_lib/security.js';

function cors(headers, configured) {
  const previous = { ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS, APP_ORIGIN: process.env.APP_ORIGIN };
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.APP_ORIGIN;
  if (configured) process.env.ALLOWED_ORIGINS = configured;
  const sent = {};
  try {
    return { allowed: applyCors({ headers }, { setHeader: (name, value) => { sent[name] = value; } }), sent };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('browser POSTs from the serving HTTPS host work without an origin allowlist', () => {
  for (const host of ['legal-trial.vercel.app', 'legal-trial-preview.vercel.app', 'practice.example.com']) {
    const result = cors({ host, origin: `https://${host}` });
    assert.equal(result.allowed, true, host);
    assert.equal(result.sent['Access-Control-Allow-Origin'], `https://${host}`);
    assert.equal(result.sent['Access-Control-Allow-Credentials'], undefined);
  }
});

test('cross-origin requests remain denied, including spoofed forwarded hosts', () => {
  for (const origin of ['https://attacker.example', 'https://legal-trial.vercel.app.attacker.example', 'http://legal-trial.vercel.app', 'null']) {
    const result = cors({ host: 'legal-trial.vercel.app', origin, 'x-forwarded-host': origin.replace(/^https?:\/\//, '') });
    assert.equal(result.allowed, false, origin);
    assert.equal(result.sent['Access-Control-Allow-Origin'], undefined);
  }
  assert.equal(cors({ origin: 'https://attacker.example' }).allowed, false);
});

test('explicit cross-origin allowlists and requests without Origin still work', () => {
  assert.equal(cors({ host: 'api.example.com', origin: 'https://app.example.com' }, 'https://app.example.com').allowed, true);
  const result = cors({ host: 'legal-trial.vercel.app' });
  assert.equal(result.allowed, true);
  assert.equal(result.sent['Access-Control-Allow-Origin'], undefined);
  assert.equal(cors({ origin: 'http://localhost:3000' }).allowed, true);
});
