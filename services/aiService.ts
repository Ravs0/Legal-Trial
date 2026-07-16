import {
  Chat,
  ChatMessage,
  ChatStreamChunk,
  PerformanceMetrics,
  PracticeMode,
  SessionPerformanceAnalysis,
  SessionRecord,
  SessionSettings,
  TrialPhase,
  TrialScoreBreakdown,
  DraftingTask,
} from '../types';
import { assessArgument } from './trialScoring';

// ─── Core API call ────────────────────────────────────────────────────────────
//
// One-key model: all requests proxy through /api/chat, which holds the
// server-side model key. The client never sees or sets any key. If the server
// is misconfigured or the upstream fails, we surface the real error to the UI
// rather than silently fabricating a response.

export type AiServiceErrorCode =
  | 'http'
  | 'network'
  | 'aborted'
  | 'empty'
  | 'stream'
  | 'invalid_json'
  | 'unknown';

export class AiServiceError extends Error {
  readonly code: AiServiceErrorCode;
  readonly status?: number;

  constructor(
    message: string,
    options?: { code?: AiServiceErrorCode; status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AiServiceError';
    this.code = options?.code ?? 'unknown';
    this.status = options?.status;
  }
}

export const AI_CANCELLED_MESSAGE =
  'The AI request was cancelled. Your work is preserved; retry when ready.';
export const AI_NETWORK_MESSAGE =
  'Network error reaching the AI service. Check connection and retry.';
export const AI_EMPTY_STREAM_MESSAGE =
  'The AI service returned an empty response. Your work is preserved; retry shortly.';
export const AI_STREAM_FAILED_MESSAGE =
  'The AI stream failed. Your work is preserved; retry shortly.';

const MAX_CHAT_HISTORY_MESSAGES = 24;
const boundedHistory = (history: { role: string; content: string }[]) => history.slice(-MAX_CHAT_HISTORY_MESSAGES);

const isDevEnv = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

/** True for DOMException/Error aborts and aborted-signal races (incl. fetch cancel). */
export function isAiAbortError(err: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  if (!err) return false;
  if (err instanceof AiServiceError && err.code === 'aborted') return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (err instanceof Error && /aborted|abort(ed)?|The user aborted|The operation was aborted/i.test(err.message)) {
    return true;
  }
  return false;
}

const isNetworkFetchError = (err: unknown): boolean => {
  if (!(err instanceof TypeError) && !(err instanceof Error)) return false;
  // Browser: "Failed to fetch"; Safari: "Load failed"; Node undici: "fetch failed"
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|econnrefused|enotfound/i
    .test(err.message || '');
};

/**
 * Map HTTP status (+ optional server error string) to a user-facing message.
 * Exported for pure unit tests; callApi/stream use this via apiErrorMessage.
 */
export function formatAiHttpError(status: number, error?: string, isDev = false): string {
  if (isDev && status === 404) {
    return 'The AI endpoint is unavailable in Vite dev. Start the app with `vercel dev` so the local /api functions are available.';
  }
  if (status === 429) return 'The AI service is busy. Wait a moment, then retry your last submission.';
  if (status === 401 || status === 403 || status === 503) {
    return 'The AI service is currently unavailable. Your work is preserved; retry shortly.';
  }
  // Upstream timeout from /api/chat (fetchWithTimeout) and gateway timeouts.
  if (status === 504 || status === 408) {
    return 'The AI provider timed out. Try a shorter prompt, then retry.';
  }
  if (status === 502 || status === 500) {
    return 'The AI service could not respond. Your work is preserved; retry shortly.';
  }
  if (status >= 500) return 'The AI service could not respond. Your work is preserved; retry shortly.';
  if (status === 400 && error && isDev) return error;
  return error && isDev ? error : `AI service error (${status}). Please retry.`;
}

const apiErrorMessage = (status: number, error?: string) =>
  formatAiHttpError(status, error, isDevEnv());

const readApiErrorBody = async (res: Response): Promise<string | undefined> => {
  const payload = await res.json().catch(() => null) as { error?: unknown } | null;
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }
  return res.statusText || undefined;
};

/** Normalize any failure from callApi/stream into AiServiceError (or rethrow abort as AiServiceError). */
export function normalizeAiFailure(err: unknown, signal?: AbortSignal | null): AiServiceError {
  if (err instanceof AiServiceError) return err;
  if (isAiAbortError(err, signal)) {
    return new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted', cause: err });
  }
  if (isNetworkFetchError(err)) {
    return new AiServiceError(AI_NETWORK_MESSAGE, { code: 'network', cause: err });
  }
  if (err instanceof Error && err.message.trim()) {
    return new AiServiceError(err.message.trim(), { code: 'unknown', cause: err });
  }
  return new AiServiceError(AI_STREAM_FAILED_MESSAGE, { code: 'stream', cause: err });
}

export async function callApi(
  messages: { role: string; content: string }[],
  system?: string,
  options?: { temperature?: number; max_tokens?: number; signal?: AbortSignal }
): Promise<string> {
  const body: Record<string, unknown> = { messages };
  if (system) body.system = system;
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;

  if (options?.signal?.aborted) {
    throw new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' });
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!res.ok) {
      const serverError = await readApiErrorBody(res);
      throw new AiServiceError(apiErrorMessage(res.status, serverError), {
        code: 'http',
        status: res.status,
      });
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new AiServiceError('The AI service returned an unreadable response. Please retry.', {
        code: 'invalid_json',
        cause: parseErr,
      });
    }
    const text = data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string'
      ? (data as { text: string }).text
      : '';
    return text;
  } catch (error) {
    throw normalizeAiFailure(error, options?.signal);
  }
}

// ─── Chat session class ───────────────────────────────────────────────────────
class GenericChat implements Chat {
  private history: { role: string; content: string }[] = [];
  private system: string;

  constructor(initialHistory: { role: string; content: string }[], system: string) {
    this.history = boundedHistory(initialHistory);
    this.system = system;
  }

  async *sendMessageStream({ message, signal }: { message: string; signal?: AbortSignal }): AsyncIterable<{ text: string }> {
    this.history.push({ role: 'user', content: message });
    this.history = boundedHistory(this.history);

    try {
      if (signal?.aborted) {
        throw new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' });
      }

      let res: Response;
      try {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: this.history, system: this.system, stream: true }),
          signal,
        });
      } catch (fetchErr) {
        throw normalizeAiFailure(fetchErr, signal);
      }

      if (!res.ok) {
        const serverError = await readApiErrorBody(res);
        throw new AiServiceError(apiErrorMessage(res.status, serverError), {
          code: 'http',
          status: res.status,
        });
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new AiServiceError('The AI response stream is not readable. Please retry.', {
          code: 'stream',
        });
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let sawChunk = false;
      const onAbort = () => {
        try { void reader.cancel(); } catch { /* ignore */ }
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          throw new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' });
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        while (true) {
          if (signal?.aborted) {
            throw new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' });
          }
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            // reader.cancel() on abort often rejects read(); treat as cancel when signal is set.
            throw normalizeAiFailure(readErr, signal);
          }
          const { done, value } = readResult;
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          sawChunk = true;
          accumulatedText += chunk;
          yield { text: chunk };
        }

        // Flush multi-byte UTF-8 remainder held by the decoder.
        const tail = decoder.decode();
        if (tail) {
          sawChunk = true;
          accumulatedText += tail;
          yield { text: tail };
        }
      } finally {
        if (signal) signal.removeEventListener('abort', onAbort);
        try { reader.releaseLock(); } catch { /* already released / cancelled */ }
      }

      // Client abort after the upstream finished mid-flight (watchdog / leave hearing).
      if (signal?.aborted) {
        throw new AiServiceError(AI_CANCELLED_MESSAGE, { code: 'aborted' });
      }

      // Empty successful stream must not pollute history as a blank assistant turn.
      if (!accumulatedText.trim()) {
        throw new AiServiceError(
          sawChunk
            ? AI_EMPTY_STREAM_MESSAGE
            : 'The AI service closed the stream without content. Your work is preserved; retry shortly.',
          { code: 'empty' },
        );
      }

      this.history.push({ role: 'assistant', content: accumulatedText });
      this.history = boundedHistory(this.history);
    } catch (error) {
      // Don't pollute the conversation history with a failed attempt.
      this.history.pop();
      throw normalizeAiFailure(error, signal);
    }
  }
}


const PHASE_LABELS: Record<TrialPhase, string> = {
  opening: 'Opening submissions',
  issue_framing: 'Issue framing',
  rebuttal: 'Rebuttal',
  judicial_questions: 'Judicial questions',
  closing: 'Closing submissions',
};

const buildTranscriptWindow = (messages: ChatMessage[], limit = 8) => {
  return messages
    .slice(-limit)
    .map(msg => {
      const label = msg.sender === 'user'
        ? 'User Counsel'
        : msg.sender === 'judge'
          ? 'The Court'
          : msg.sender === 'opposingCounsel'
            ? 'Opposing Counsel'
            : 'System';
      const phaseLabel = msg.meta?.phase ? ` [${PHASE_LABELS[msg.meta.phase]}]` : '';
      const kindLabel = msg.meta?.kind ? ` {${msg.meta.kind}}` : '';
      return `${label}${phaseLabel}${kindLabel}: ${msg.text}`;
    })
    .join('\n\n');
};

const buildScoreSummary = (score?: TrialScoreBreakdown) => {
  if (!score) return 'No live score summary is available yet.';
  return `Engagement ${score.engagement}, Advocacy ${score.advocacy}, Objections ${score.objections}, Responsiveness ${score.responsiveness}, Professionalism ${score.professionalism}, Total ${score.total}.`;
};

const PHASE_OBJECTIVES: Record<TrialPhase, string> = {
  opening: 'Frame the dispute, your theory of the case, and the relief sought.',
  issue_framing: 'Pin down the dispositive legal issue and governing test.',
  rebuttal: 'Answer the strongest opposing point using the record and law.',
  judicial_questions: 'Give direct, candid answers to the Court’s hardest concerns.',
  closing: 'Synthesize the rule, application, and precise relief in a short closing.',
};

export const buildJudgePrompt = (
  settings: SessionSettings,
  transcript: ChatMessage[],
  phase: TrialPhase,
  latestUserSubmission: string,
  latestOpposingResponse: string,
  score?: TrialScoreBreakdown,
) => {
  return `Active hearing phase: ${PHASE_LABELS[phase]}.
Phase objective: ${PHASE_OBJECTIVES[phase]}

Case title: ${settings.caseDetail.title}
Facts: ${settings.caseDetail.briefFacts}
Issues: ${settings.caseDetail.legalIssues.join('; ')}
Relevant law: ${settings.caseDetail.relevantArticlesSections}
Live score context: ${buildScoreSummary(score)}

Recent transcript:
${buildTranscriptWindow(transcript)}

User counsel's latest submission:
${latestUserSubmission}

Opposing counsel's latest response:
${latestOpposingResponse}

As the presiding judge, respond in character. Address only what was actually argued. Identify one strongest point and the single missing link (issue, rule, fact, application, or relief), then ask one precise question or give one instruction that advances the phase objective. Do not invent facts, authorities, or procedural rules; if an authority is unverified, say so. Keep it courtroom-focused and under 170 words.`;
};

export const buildOpposingCounselPrompt = (
  settings: SessionSettings,
  transcript: ChatMessage[],
  phase: TrialPhase,
  userSubmission: string,
) => {
  return `Active hearing phase: ${PHASE_LABELS[phase]}.
Phase objective: ${PHASE_OBJECTIVES[phase]}

Case title: ${settings.caseDetail.title}
Facts: ${settings.caseDetail.briefFacts}
Issues: ${settings.caseDetail.legalIssues.join('; ')}
Relevant law: ${settings.caseDetail.relevantArticlesSections}

Recent transcript:
${buildTranscriptWindow(transcript)}

User counsel's latest submission:
${userSubmission}

Respond as opposing counsel in character. Select the single weakest unaddressed link in the user's submission—issue, rule, fact, application, remedy, or response to the other side—and challenge it with a concrete question or counter-position. Do not invent facts, authorities, or procedural rules. Avoid repeating earlier points unless sharpening them. Keep it under 150 words.`;
};

const clampScore = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(1, Math.min(10, Math.round(numeric)));
};

const normalizePerformanceMetrics = (parsed: any): PerformanceMetrics => {
  const legalGrounding = parsed.legalGrounding ?? parsed.legalBasis ?? parsed.constitutionalBasis ?? 0;
  return {
    argumentStrength: clampScore(parsed.argumentStrength),
    precedentUsage: clampScore(parsed.precedentUsage),
    legalGrounding: clampScore(legalGrounding),
    responseQuality: clampScore(parsed.responseQuality),
    objectionHandling: clampScore(parsed.objectionHandling ?? parsed.objections ?? parsed.responseQuality),
    courtroomPresence: clampScore(parsed.courtroomPresence ?? parsed.professionalism ?? parsed.argumentStrength),
    overallScore: clampScore(parsed.overallScore),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : 'Analysis unavailable.',
    improvementAreas: Array.isArray(parsed.improvementAreas)
      ? parsed.improvementAreas.filter((item: unknown) => typeof item === 'string')
      : [],
  };
};

/**
 * Keeps a completed hearing useful when an AI analysis request is unavailable.
 * This is deliberately labelled as local coaching and uses only transparent
 * transcript signals—never invented legal conclusions or citations.
 */
export const buildLocalPerformanceMetrics = (
  sessionRecord: SessionRecord,
  scoreBreakdown?: TrialScoreBreakdown,
): PerformanceMetrics => {
  const argumentsMade = sessionRecord.transcript.filter(message => message.sender === 'user' && message.meta?.kind !== 'objection');
  const assessments = argumentsMade.map(message => message.meta?.argumentQuality || assessArgument(message.text));
  const average = (selector: (assessment: typeof assessments[number]) => number) => (
    assessments.length ? assessments.reduce((sum, assessment) => sum + selector(assessment), 0) / assessments.length : 0
  );
  const scoreFromRatio = (ratio: number) => clampScore(Math.round(ratio * 9) + 1);
  const objections = sessionRecord.transcript
    .filter(message => message.meta?.kind === 'objection')
    .map(message => message.meta?.objection?.outcome)
    .filter((outcome): outcome is 'sustained' | 'overruled' | 'reserved' => Boolean(outcome));
  const sustained = objections.filter(outcome => outcome === 'sustained').length;
  const overruled = objections.filter(outcome => outcome === 'overruled').length;
  const live = scoreBreakdown || sessionRecord.scoreBreakdown;
  const signalScore = average(assessment => assessment.score) / 10;
  const rules = average(assessment => assessment.rule ? 1 : 0);
  const factualApplications = average(assessment => assessment.facts && assessment.application ? 1 : 0);
  const responses = average(assessment => assessment.respondsToOpponent ? 1 : 0);
  const remedies = average(assessment => assessment.remedy ? 1 : 0);
  const professionalism = live ? Math.min(1, Math.max(0, live.professionalism / 35)) : 0.5;
  const objectionScore = objections.length === 0 ? 5 : clampScore((sustained * 8 + (objections.length - sustained - overruled) * 5 + overruled * 2) / objections.length);
  const improvementAreas = [
    rules < 0.5 ? 'Name a governing rule or authority, then verify it against a primary source.' : '',
    factualApplications < 0.5 ? 'Link each legal proposition to a concrete fact in the record and explain the consequence.' : '',
    responses < 0.4 ? 'Answer the strongest opposing point directly before returning to your theory.' : '',
    remedies < 0.5 ? 'Finish submissions with the specific relief or direction you seek.' : '',
    overruled > sustained ? 'Use objections selectively and state the legal basis before raising one.' : '',
  ].filter(Boolean);
  const feedback = assessments.length
    ? `Local coaching summary: your arguments averaged ${Math.round(signalScore * 10)}/10 for advocacy structure. ${factualApplications >= 0.6 ? 'You generally connected law to the record.' : 'Your next gains will come from clearer law-to-fact application.'} ${responses >= 0.5 ? 'You engaged with opposing positions.' : 'Make the opposing position explicit, then answer it.'}`
    : 'Local coaching summary: no substantive submissions were recorded, so no advocacy pattern could be assessed.';

  return {
    argumentStrength: scoreFromRatio(signalScore),
    precedentUsage: scoreFromRatio(rules),
    legalGrounding: scoreFromRatio((rules + factualApplications) / 2),
    responseQuality: scoreFromRatio((factualApplications + responses) / 2),
    objectionHandling: objectionScore,
    courtroomPresence: scoreFromRatio(professionalism),
    overallScore: clampScore((scoreFromRatio(signalScore) + scoreFromRatio((rules + factualApplications) / 2) + scoreFromRatio((factualApplications + responses) / 2) + objectionScore + scoreFromRatio(professionalism)) / 5),
    feedback,
    improvementAreas: improvementAreas.length ? improvementAreas : ['Keep testing each submission against issue, rule, fact, application, and relief.'],
  };
};

const parseJsonResponse = (raw: string) => {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
};

const buildInitialHistory = (
  settings: SessionSettings,
  persona: 'judge' | 'opposingCounsel'
): { role: string; content: string }[] => {
  if (persona === 'judge') {
    return [
      { role: 'user', content: `We are ready to begin the mock trial for: ${settings.caseDetail.title}. I represent my client. Opposing counsel is ${settings.opposingCounselPersonality.name}.` },
      { role: 'assistant', content: `Very well. You may proceed with your arguments regarding ${settings.caseDetail.title}. I will hear from both counsels. The Court expects rigorous arguments.` },
    ];
  }
  return [
    { role: 'user', content: `We are commencing the mock trial for ${settings.caseDetail.title}. I will argue first. The presiding judge is ${settings.judgePersonality.name}.` },
    { role: 'assistant', content: `Understood. I am prepared to present counter-arguments in this matter. Let us proceed.` },
  ];
};

/** Seed chat memory from a saved transcript so resume does not wipe AI context. */
const seedHistoryFromTranscript = (
  base: { role: string; content: string }[],
  transcript: ChatMessage[] | undefined,
  persona: 'judge' | 'opposingCounsel',
): { role: string; content: string }[] => {
  if (!transcript || transcript.length === 0) return base;
  const window = buildTranscriptWindow(transcript, 24);
  if (!window.trim()) return base;
  const roleNote = persona === 'judge'
    ? 'You are the presiding judge. Continue the hearing with full awareness of this record.'
    : 'You are opposing counsel. Continue arguing with full awareness of this record.';
  return [
    ...base,
    {
      role: 'user',
      content: `Prior hearing record (resume mid-session). ${roleNote}\n\n${window}`,
    },
    {
      role: 'assistant',
      content: persona === 'judge'
        ? 'The Court has the full record before it. You may continue, Counsel.'
        : 'I have the record. I will continue to challenge your submissions rigorously.',
    },
  ];
};

export const startJudgeChatSession = (settings: SessionSettings, priorTranscript?: ChatMessage[]): Chat => {
  const system = `${settings.judgePersonality.systemInstruction}

**Trial Context:**
- Case: ${settings.caseDetail.title}
- Facts: ${settings.caseDetail.briefFacts}
- Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
- Relevant Law: ${settings.caseDetail.relevantArticlesSections}
- Mode: ${settings.practiceMode} law
- Opposing Counsel: ${settings.opposingCounselPersonality.name}

You are a fictional presiding-judge training persona, ${settings.judgePersonality.name}. Stay in role without claiming real judicial authority. Test advocacy by identifying whether counsel supplied an issue, rule, record fact, application, and relief. Never invent facts or citations; ask for verification where needed. Keep responses under 150 words.`;

  return new GenericChat(
    seedHistoryFromTranscript(buildInitialHistory(settings, 'judge'), priorTranscript, 'judge'),
    system,
  );
};

export const startOpposingCounselChatSession = (settings: SessionSettings, priorTranscript?: ChatMessage[]): Chat => {
  const system = `${settings.opposingCounselPersonality.systemInstruction}

**Trial Context:**
- Case: ${settings.caseDetail.title}
- Facts: ${settings.caseDetail.briefFacts}
- Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
- Mode: ${settings.practiceMode} law
- Judge: ${settings.judgePersonality.name}

You are a fictional opposing-counsel training persona, ${settings.opposingCounselPersonality.name}. Challenge the user's arguments rigorously by targeting a real gap in the record or reasoning, not by inventing facts or citations. Keep responses under 120 words.`;

  return new GenericChat(
    seedHistoryFromTranscript(buildInitialHistory(settings, 'opposingCounsel'), priorTranscript, 'opposingCounsel'),
    system,
  );
};

export const sendMessageToChatStream = async (
  chat: Chat,
  message: string,
  options?: { signal?: AbortSignal },
): Promise<AsyncIterable<ChatStreamChunk> | null> => {
  if (!chat) return null;
  const msg = message.trim() || 'Please proceed, Counsel.';
  return chat.sendMessageStream({ message: msg, signal: options?.signal });
};

// ─── Performance analysis ─────────────────────────────────────────────────────

/**
 * Always returns metrics: AI when available, otherwise transparent local coaching.
 * Callers should stamp `analysisStatus.source` from the returned `source` field.
 */
export const analyzeSessionPerformance = async (
  sessionRecord: SessionRecord,
  scoreBreakdown?: TrialScoreBreakdown
): Promise<SessionPerformanceAnalysis> => {
  const transcriptText = buildTranscriptWindow(sessionRecord.transcript, 40);
  const scoreLine = `\n\n[Live score summary: ${buildScoreSummary(scoreBreakdown || sessionRecord.scoreBreakdown)}]`;

  const system = `You are an expert legal performance analyst evaluating a mock trial in ${sessionRecord.settings.practiceMode} law.
Return ONLY a raw JSON object. No markdown. Use integer scores from 1 to 10 for:
argumentStrength, precedentUsage, legalGrounding, responseQuality, objectionHandling, courtroomPresence, overallScore, feedback (string), improvementAreas (string[]).
Evaluate substance over activity volume. Penalize irrelevant length, unsupported authorities, evasive responses, and meritless objections. Treat live score only as secondary context.`;

  const userPrompt = `Case: ${sessionRecord.settings.caseDetail.title}
Issues: ${sessionRecord.settings.caseDetail.legalIssues.join('; ')}
Relevant law: ${sessionRecord.settings.caseDetail.relevantArticlesSections}
${scoreLine}

Transcript:
${transcriptText}

Generate the JSON evaluation.`;

  try {
    const raw = await callApi([{ role: 'user', content: userPrompt }], system);
    try {
      return { metrics: normalizePerformanceMetrics(parseJsonResponse(raw)), source: 'ai' };
    } catch {
      const repairRaw = await callApi(
        [{ role: 'user', content: `Repair this response into the required raw JSON object only:\n\n${raw}` }],
        system,
      );
      return { metrics: normalizePerformanceMetrics(parseJsonResponse(repairRaw)), source: 'ai' };
    }
  } catch {
    return {
      metrics: buildLocalPerformanceMetrics(sessionRecord, scoreBreakdown),
      source: 'local',
    };
  }
};

// ─── Drafting helpers ─────────────────────────────────────────────────────────

/** Reject empty / error-prefixed model text so callers never treat failure as content. */
export const requireDraftingAiText = (text: string | null | undefined, label: string): string => {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new AiServiceError(
      `${label} returned an empty response. Your work is preserved; retry shortly.`,
      { code: 'empty' },
    );
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('error:') || lower.startsWith('error ')) {
    const detail = trimmed.replace(/^error:\s*/i, '').trim();
    throw new AiServiceError(
      detail || `${label} failed. Your work is preserved; retry shortly.`,
      { code: 'unknown' },
    );
  }
  return trimmed;
};

/** Map non-AiService failures from drafting helpers into AiServiceError (preserve abort/network codes). */
const rethrowDraftingFailure = (err: unknown, fallback: string): never => {
  if (err instanceof AiServiceError) throw err;
  throw normalizeAiFailure(
    err instanceof Error && err.message.trim()
      ? err
      : new Error(fallback),
  );
};

const lawListText = (relevantLaws: string[] | string | undefined) =>
  Array.isArray(relevantLaws) ? relevantLaws.join('; ') : (relevantLaws || '');

export const generateDraftingFacts = async (
  documentType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode,
  objective: string
): Promise<string> => {
  if (!practiceMode) throw new AiServiceError('Practice mode is required for fact generation.');
  if (!documentType?.trim()) throw new AiServiceError('Document type is required for fact generation.');
  if (!objective?.trim()) throw new AiServiceError('Drafting objective is required for fact generation.');

  const lawText = lawListText(relevantLaws);
  const system = `You are a Legal Scenario Architect. Write one realistic fact-pattern paragraph for a ${practiceMode} law drafting exercise. Make the facts specific enough to support drafting choices. No intro or outro.`;
  try {
    const raw = await callApi([
      {
        role: 'user',
        content: `Document type: ${documentType}
Objective: ${objective}
Relevant law: ${lawText || 'Not specified'}

Generate a single fact scenario paragraph tailored to this exercise.`
      }
    ], system);
    return requireDraftingAiText(raw, 'Fact generation');
  } catch (err) {
    return rethrowDraftingFailure(err, 'Fact generation failed. Retry shortly.');
  }
};

export const generateDraftingGuidance = async (
  task: DraftingTask,
  userDraft: string,
  generatedFacts: string,
  practiceMode: PracticeMode,
  sectionName?: string
): Promise<string> => {
  if (!practiceMode) throw new AiServiceError('Practice mode is required for draft review.');
  if (!task?.title?.trim()) throw new AiServiceError('A drafting task is required for review.');
  if (!userDraft?.trim()) throw new AiServiceError('Write a draft before submitting for review.');
  if (!generatedFacts?.trim()) throw new AiServiceError('Scenario facts are missing. Regenerate the scenario, then retry review.');

  const lawText = lawListText(task.relevantLaws);
  const sectionPrompt = sectionName ? `Focus especially on the section titled "${sectionName}".` : 'Review the document as a whole.';
  const expectedSections = task.sections?.map(section => section.name).join(', ') || 'No predefined sections supplied.';
  const system = `You are an expert legal drafting mentor in ${practiceMode} law. Give concrete, task-specific feedback in four parts: strengths, missing legal elements, drafting risks, and next revisions. Avoid generic praise.`;
  try {
    const raw = await callApi([
      {
        role: 'user',
        content: `Task: ${task.title}
Document type: ${task.type}
Objective: ${task.objective}
Relevant law: ${lawText}
Expected sections: ${expectedSections}
Generated facts: ${generatedFacts}
${sectionPrompt}

User draft:
${userDraft}`
      }
    ], system);
    return requireDraftingAiText(raw, 'Draft review');
  } catch (err) {
    return rethrowDraftingFailure(err, 'Draft review failed. Your draft is preserved; retry shortly.');
  }
};

export const getFilingProcedureInfo = async (
  draftType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode
): Promise<string> => {
  if (!practiceMode) throw new AiServiceError('Practice mode is required for filing guidance.');
  if (!draftType?.trim()) throw new AiServiceError('Draft type is required for filing guidance.');

  const lawText = lawListText(relevantLaws);
  const system = `You are a legal procedural guide for ${practiceMode} law. Provide a cautious bullet-point filing workflow, highlight jurisdiction-specific uncertainties, and end with a short training-use disclaimer.`;
  try {
    const raw = await callApi([
      {
        role: 'user',
        content: `Draft type: ${draftType}
Relevant law: ${lawText || 'Not specified'}

Provide the filing or submission workflow.`
      }
    ], system);
    return requireDraftingAiText(raw, 'Filing guidance');
  } catch (err) {
    return rethrowDraftingFailure(err, 'Filing guidance failed. Retry shortly.');
  }
};

export const summarizeSearchResults = async (
  query: string,
  results: any[],
  practiceMode: PracticeMode | 'common',
  options?: { signal?: AbortSignal },
): Promise<string> => {
  const system = `You are a Legal Research Assistant specializing in ${practiceMode} law. Synthesize the provided search results to answer the query: "${query}". Be concise, structured, and cite sources.`;
  const content = `Search query: "${query}"\n\nResults:\n${JSON.stringify(results)}`;
  return callApi([{ role: 'user', content }], system, { signal: options?.signal });
};
