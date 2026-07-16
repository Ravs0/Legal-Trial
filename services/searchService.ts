/**
 * Client for `/api/search` — legal web discovery used by Web Search drawer
 * and LexIDE research. Validates input, supports abort/timeout, and
 * normalizes results so UI never renders unsafe URLs or unbounded strings.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchWebOptions {
  /** Optional abort signal so callers can cancel stale searches. */
  signal?: AbortSignal;
  /**
   * Client-side deadline in ms for the whole request (default 30s).
   * Combined with `signal` via AbortController. Pass `0` to disable.
   */
  timeoutMs?: number;
}

export class SearchServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SearchServiceError';
    this.status = status;
  }
}

const MAX_RESULTS = 25;
const MAX_FIELD_LEN = 500;
const MAX_SNIPPET = 1000;
const MAX_URL = 2000;
const MAX_QUERY_LENGTH = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function clip(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

/** True for AbortError / DOMException abort / our cancelled search errors. */
export function isSearchAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof SearchServiceError && err.status === 499) return true;
  if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
    return true;
  }
  return typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError';
}

/** Normalize / drop malformed API rows so the drawer never renders junk. */
export function normalizeSearchResults(raw: unknown): SearchResult[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchResult[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const url = clip(r.url, MAX_URL);
    if (!url || !isSafeHttpUrl(url)) continue;
    const title = clip(r.title) || clip(r.url) || 'Result';
    const snippet = clip(r.snippet, MAX_SNIPPET);
    out.push({ title, url, snippet });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/**
 * Run a web search via the LexForge search proxy.
 * Empty / non-string queries resolve to `[]`. Provider / HTTP failures throw
 * `SearchServiceError` (or rethrow native network `Error`s such as TypeError).
 */
export async function searchWeb(
  query: string,
  options: SearchWebOptions = {},
): Promise<SearchResult[]> {
  if (typeof query !== 'string' || !query.trim()) return [];

  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);

  const external = options.signal;
  if (external?.aborted) {
    throw new SearchServiceError('Search cancelled.', 499);
  }

  const timeoutOpt = options.timeoutMs;
  const timeoutMs =
    timeoutOpt === 0
      ? 0
      : typeof timeoutOpt === 'number' && Number.isFinite(timeoutOpt) && timeoutOpt > 0
        ? Math.min(Math.trunc(timeoutOpt), 120_000)
        : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onExternalAbort = () => controller.abort();
  if (external) {
    external.addEventListener('abort', onExternalAbort);
  }

  try {
    // Race fetch against an explicit timeout so we still fail closed when a
    // polyfill/mock ignores AbortSignal (native fetch aborts via signal too).
    const fetchPromise = fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed }),
      signal: controller.signal,
    });

    let res: Response;
    try {
      if (timeoutMs > 0) {
        res = await Promise.race([
          fetchPromise,
          new Promise<Response>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new SearchServiceError('Search timed out. Try a narrower query.', 504));
            }, timeoutMs);
          }),
        ]);
      } else {
        res = await fetchPromise;
      }
    } catch (error) {
      if (error instanceof SearchServiceError) throw error;
      if (isSearchAbortError(error) || controller.signal.aborted) {
        if (timedOut && !external?.aborted) {
          throw new SearchServiceError('Search timed out. Try a narrower query.', 504);
        }
        // Preserve native AbortError when the caller cancelled via signal.
        if (external?.aborted && error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        throw new SearchServiceError('Search cancelled.', 499);
      }
      // Preserve TypeError / network Errors for callers and existing tests.
      throw error instanceof Error ? error : new SearchServiceError('Failed to execute web search');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const message =
        err && typeof err === 'object' && typeof (err as { error?: unknown }).error === 'string'
          ? (err as { error: string }).error
          : `Search error (${res.status})`;
      throw new SearchServiceError(message, res.status);
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return [];
    return normalizeSearchResults((data as { results?: unknown }).results);
  } catch (error) {
    if (error instanceof SearchServiceError) throw error;
    if (isSearchAbortError(error)) {
      if (timedOut && !external?.aborted) {
        throw new SearchServiceError('Search timed out. Try a narrower query.', 504);
      }
      throw error instanceof Error ? error : new SearchServiceError('Search cancelled.', 499);
    }
    throw error instanceof Error ? error : new SearchServiceError('Failed to execute web search');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (external) {
      external.removeEventListener('abort', onExternalAbort);
    }
  }
}
