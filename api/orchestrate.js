import { applyCors, allowRequest, clientError, enforceBodyLimit } from './_lib/security.js';
import { jevBudget, keyQuota, requestKey } from './_lib/guardrails.js';
import { recordJev } from './_lib/keyQuota.js';

const WINDOW_MS = 60_000;
const LIMIT = 30;
const MAX_BUDGET_MS = 55_000;

const frame = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

function middlewarePassed(middleware, req, res) {
  let passed = false;
  middleware(req, res, () => { passed = true; });
  return passed;
}

function safeCode(error, fallback = 'chain-degraded') {
  const code = error?.code;
  return typeof code === 'string' && /^[a-z0-9_-]+$/i.test(code) ? code : fallback;
}

async function loadChain() {
  try {
    const mod = await import('./_lib/lexforge/chain.js');
    return typeof mod.runChain === 'function' ? mod.runChain : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json(clientError('Origin is not allowed.'));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json(clientError('Method not allowed'));
  if (!enforceBodyLimit(req, res)) return;
  if (!allowRequest(req, { limit: LIMIT, windowMs: WINDOW_MS })) {
    return res.status(429).json(clientError('Too many requests. Please wait a minute and try again.'));
  }

  const {
    caseId,
    phase,
    argument,
    budgetMs = MAX_BUDGET_MS,
    needle = {},
    transcript: bodyTranscript,
  } = req.body ?? {};
  if (!caseId || !phase || typeof argument !== 'string' || !argument.trim()) {
    return res.status(400).json({ error: 'caseId,phase,argument required' });
  }

  const transcript = typeof bodyTranscript === 'string' && bodyTranscript.trim()
    ? bodyTranscript
    : argument;
  if (transcript.trim().length < 10) {
    return res.status(400).json({ error: 'transcript required', code: 'chain-bad-request' });
  }

  // The general key quota and the JEV bucket are both enforced before any
  // provider work. The JEV bucket is route-local because it also gates the
  // optional LLM judge inside runChain.
  if (!middlewarePassed(keyQuota, req, res)) return;
  if (!middlewarePassed(jevBudget, req, res)) return;

  const runChain = await loadChain();
  if (!runChain) return res.status(503).json({ error: 'chain-degraded', code: 'chain-degraded' });

  const parsedBudget = Number(budgetMs);
  const timeoutMs = Number.isFinite(parsedBudget) && parsedBudget > 0
    ? Math.min(parsedBudget, MAX_BUDGET_MS)
    : MAX_BUDGET_MS;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('budget_exceeded');
      error.name = 'AbortError';
      reject(error);
    }, timeoutMs);
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on?.('close', abortOnDisconnect);
  req.on?.('aborted', abortOnDisconnect);

  try {
    frame(res, 'turn.start', { caseId, phase, at: Date.now(), chain: true });

    // runChain owns the JEV confidence gate. It calls the LLM judge only on a
    // gated turn, so orchestration never needs a parallel counsel/judge/scorer
    // fan-out or a fallback call to routes that do not exist.
    const chainWork = runChain({
      transcript,
      needle: needle && typeof needle === 'object' && !Array.isArray(needle) ? needle : {},
      phase,
      signal: controller.signal,
    });
    const out = await Promise.race([chainWork, deadline]);
    recordJev(req.jevQuotaKey || requestKey(req), out?.usage?.jevTokens ?? 0);

    frame(res, 'score.update', out);
    frame(res, 'turn.end', {
      caseId,
      phase,
      ok: true,
      meta: {
        chain: true,
        needle,
        decision: out?.decision,
        usage: out?.usage,
        ...(out?.code ? { code: out.code } : {}),
      },
    });
  } catch (error) {
    recordJev(req.jevQuotaKey || requestKey(req), 0);
    const code = error?.name === 'AbortError' ? 'budget_exceeded' : safeCode(error);
    frame(res, 'turn.error', { source: 'chain', code, message: code });
    frame(res, 'turn.end', { caseId, phase, ok: false, meta: { chain: true, code } });
  } finally {
    clearTimeout(timer);
    res.off?.('close', abortOnDisconnect);
    req.off?.('aborted', abortOnDisconnect);
    res.end();
  }
}
