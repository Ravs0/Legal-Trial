// Anonymous session helper for owner-scoped LexForge routes.
//
// The server mints a signed token at POST /api/lexforge/session. We keep it in
// localStorage so a reload keeps the same owner id (scores, drills, key
// metadata, schedules). On a 401 the token is refreshed once and the request
// replayed — a cold serverless instance may have rotated its secret.

const STORAGE_KEY = 'lexforge.session.token.v1';
const TOKEN_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSessionToken(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const token = store.getItem(STORAGE_KEY);
    return token && TOKEN_RE.test(token) ? token : null;
  } catch {
    return null;
  }
}

function writeSessionToken(token: string): void {
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    /* storage may be full or blocked; the in-memory promise still works */
  }
}

export function clearSessionToken(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let inflight: Promise<string> | null = null;

export async function getSessionToken(force = false): Promise<string> {
  if (!force) {
    const existing = readSessionToken();
    if (existing) return existing;
  }
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch('/api/lexforge/session', { method: 'POST' });
      if (!res.ok) throw new Error(`Session request failed (${res.status}).`);
      const data = (await res.json()) as { token?: unknown };
      if (typeof data?.token !== 'string' || !TOKEN_RE.test(data.token)) {
        throw new Error('Session response did not include a valid token.');
      }
      writeSessionToken(data.token);
      return data.token;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** fetch() with a session bearer, retrying once after a 401. */
export async function sessionFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (force: boolean): Promise<Response> => {
    const token = await getSessionToken(force);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const first = await send(false);
  if (first.status !== 401) return first;
  clearSessionToken();
  return send(true);
}

export const SESSION_STORAGE_KEY = STORAGE_KEY;
