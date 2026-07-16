// Run: npx tsx services/searchService.test.ts
import assert from 'node:assert/strict';
import { normalizeSearchResults, searchWeb } from './searchService';

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

// ─── normalizeSearchResults (pure) ───────────────────────────────────────────

await test('normalizeSearchResults rejects non-array', () => {
  assert.equal(normalizeSearchResults(null).length, 0);
  assert.equal(normalizeSearchResults({}).length, 0);
  assert.equal(normalizeSearchResults('x').length, 0);
});

await test('normalizeSearchResults keeps safe http rows', () => {
  const out = normalizeSearchResults([
    { title: 'A', url: 'https://example.com/a', snippet: 'ok' },
    { title: 'B', url: 'http://example.com/b', snippet: 'also' },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out[0].url.startsWith('https://'));
});

await test('normalizeSearchResults drops unsafe / incomplete urls', () => {
  const out = normalizeSearchResults([
    { title: 'js', url: 'javascript:alert(1)', snippet: 'x' },
    { title: 'data', url: 'data:text/html,hi', snippet: 'x' },
    { title: 'missing', url: '', snippet: 'x' },
    { title: 'relative', url: '/local/path', snippet: 'x' },
    null,
    42,
    { title: 'ok', url: 'https://court.gov/case', snippet: 'snippet' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'ok');
});

await test('normalizeSearchResults caps field length and count', () => {
  const long = 'x'.repeat(2000);
  const many = Array.from({ length: 50 }, (_, i) => ({
    title: `T${i}`,
    url: `https://example.com/${i}`,
    snippet: long,
  }));
  const out = normalizeSearchResults(many);
  assert.equal(out.length, 25, 'max 25');
  assert.ok(out[0].snippet.length <= 1000, 'snippet clipped');
  assert.ok(out[0].title.length <= 500, 'title clipped by MAX_FIELD_LEN');
});

await test('normalizeSearchResults falls back title from url', () => {
  const out = normalizeSearchResults([
    { title: '  ', url: 'https://example.com/only-url', snippet: 's' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'https://example.com/only-url');
});

// ─── searchWeb (fetch) ───────────────────────────────────────────────────────

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
const originalFetch = globalThis.fetch;
let fetchImpl: FetchImpl | null = null;
const calls: Array<{ url: string; init?: RequestInit }> = [];

function installFetch() {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push({ url, init });
    if (!fetchImpl) throw new Error('fetchImpl not set');
    return fetchImpl(url, init);
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  fetchImpl = null;
  calls.length = 0;
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

await test('searchWeb empty / whitespace short-circuits', async () => {
  installFetch();
  try {
    fetchImpl = async () => {
      throw new Error('fetch should not run');
    };
    assert.deepEqual(await searchWeb(''), []);
    assert.deepEqual(await searchWeb('   \t'), []);
    assert.deepEqual(await searchWeb(null as unknown as string), []);
    assert.equal(calls.length, 0);
  } finally {
    restoreFetch();
  }
});

await test('searchWeb posts trimmed query and returns normalized results', async () => {
  installFetch();
  try {
    fetchImpl = async () =>
      jsonResponse({
        results: [
          { title: 'Article 21', url: 'https://example.com/a21', snippet: 'Life and liberty' },
          { title: 'bad', url: 'javascript:alert(1)', snippet: 'drop me' },
          { title: 'Notice', url: 'https://example.com/notice', snippet: 'Service' },
        ],
      });

    const results = await searchWeb('  article 21 notice  ');
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Article 21');
    assert.equal(results[1].url, 'https://example.com/notice');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/search');
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal((calls[0].init?.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.equal(JSON.parse(String(calls[0].init?.body)).query, 'article 21 notice');
  } finally {
    restoreFetch();
  }
});

await test('searchWeb truncates query to 500 chars', async () => {
  installFetch();
  try {
    fetchImpl = async () => jsonResponse({ results: [] });
    const long = 'q'.repeat(800);
    await searchWeb(long);
    const sent = JSON.parse(String(calls[0].init?.body)).query as string;
    assert.equal(sent.length, 500);
  } finally {
    restoreFetch();
  }
});

await test('searchWeb returns [] when results missing or body invalid', async () => {
  installFetch();
  try {
    fetchImpl = async () => jsonResponse({ status: 'ok' });
    assert.deepEqual(await searchWeb('bail'), []);

    fetchImpl = async () =>
      new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    assert.deepEqual(await searchWeb('bail'), []);
  } finally {
    restoreFetch();
  }
});

await test('searchWeb throws SearchServiceError with server message', async () => {
  installFetch();
  try {
    fetchImpl = async () => jsonResponse({ error: 'Search provider unavailable' }, 503, 'Service Unavailable');
    await assert.rejects(
      () => searchWeb('habeas'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'SearchServiceError');
        assert.match(err.message, /Search provider unavailable/);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

await test('searchWeb falls back when error body is non-json', async () => {
  installFetch();
  try {
    fetchImpl = async () =>
      new Response('upstream melted', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/plain' },
      });
    await assert.rejects(
      () => searchWeb('injunction'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'SearchServiceError');
        // statusText via catch fallback, or generic status message
        assert.match(err.message, /Bad Gateway|Search error \(502\)/);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

await test('searchWeb rethrows Error network failures', async () => {
  installFetch();
  try {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(
      () => searchWeb('res judicata'),
      (err: unknown) => err instanceof TypeError && /Failed to fetch/.test(err.message),
    );
  } finally {
    restoreFetch();
  }
});

await test('searchWeb wraps non-Error throws', async () => {
  installFetch();
  try {
    fetchImpl = async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'boom';
    };
    await assert.rejects(
      () => searchWeb('locus standi'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'SearchServiceError');
        assert.match(err.message, /Failed to execute web search/);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
