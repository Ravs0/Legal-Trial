import {
  Chat,
  ChatMessage,
  PerformanceMetrics,
  PracticeMode,
  SessionRecord,
  SessionSettings,
  TrialPhase,
  TrialScoreBreakdown,
  DraftingTask,
} from '../types';

// ─── Core API call ────────────────────────────────────────────────────────────
//
// One-key model: all requests proxy through /api/chat, which holds the
// server-side model key. The client never sees or sets any key. If the server
// is misconfigured or the upstream fails, we surface the real error to the UI
// rather than silently fabricating a response.

class AiServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export async function callApi(
  messages: { role: string; content: string }[],
  system?: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const body: Record<string, unknown> = { messages };
  if (system) body.system = system;
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new AiServiceError(err.error || `AI service error (${res.status})`);
  }
  const data = await res.json();
  return data.text || '';
}

// ─── Chat session class ───────────────────────────────────────────────────────
class GenericChat implements Chat {
  private history: { role: string; content: string }[] = [];
  private system: string;

  constructor(initialHistory: { role: string; content: string }[], system: string) {
    this.history = [...initialHistory];
    this.system = system;
  }

  async *sendMessageStream({ message }: { message: string }): AsyncIterable<{ text: string }> {
    this.history.push({ role: 'user', content: message });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.history, system: this.system, stream: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        yield { text: chunk };
      }

      this.history.push({ role: 'assistant', content: accumulatedText });
    } catch (error) {
      // Don't pollute the conversation history with a failed attempt.
      this.history.pop();
      throw error instanceof Error ? error : new AiServiceError('AI stream failed');
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

export const buildJudgePrompt = (
  settings: SessionSettings,
  transcript: ChatMessage[],
  phase: TrialPhase,
  latestUserSubmission: string,
  latestOpposingResponse: string,
  score?: TrialScoreBreakdown,
) => {
  return `Active hearing phase: ${PHASE_LABELS[phase]}.

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

As the presiding judge, respond in character. Address what was actually argued, identify the strongest and weakest point you heard, and either ask the next precise question or give the next instruction for this phase. Keep it courtroom-focused and under 170 words.`;
};

export const buildOpposingCounselPrompt = (
  settings: SessionSettings,
  transcript: ChatMessage[],
  phase: TrialPhase,
  userSubmission: string,
) => {
  return `Active hearing phase: ${PHASE_LABELS[phase]}.

Case title: ${settings.caseDetail.title}
Facts: ${settings.caseDetail.briefFacts}
Issues: ${settings.caseDetail.legalIssues.join('; ')}
Relevant law: ${settings.caseDetail.relevantArticlesSections}

Recent transcript:
${buildTranscriptWindow(transcript)}

User counsel's latest submission:
${userSubmission}

Respond as opposing counsel in character. Challenge the user on facts, law, remedy, and procedural posture. Avoid repeating earlier points unless sharpening them. Keep it under 150 words.`;
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

export const startJudgeChatSession = (settings: SessionSettings): Chat => {
  const system = `${settings.judgePersonality.systemInstruction}

**Trial Context:**
- Case: ${settings.caseDetail.title}
- Facts: ${settings.caseDetail.briefFacts}
- Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
- Relevant Law: ${settings.caseDetail.relevantArticlesSections}
- Mode: ${settings.practiceMode} law
- Opposing Counsel: ${settings.opposingCounselPersonality.name}

You are Presiding Judge ${settings.judgePersonality.name}. NEVER break character. Keep responses under 150 words.`;

  return new GenericChat(buildInitialHistory(settings, 'judge'), system);
};

export const startOpposingCounselChatSession = (settings: SessionSettings): Chat => {
  const system = `${settings.opposingCounselPersonality.systemInstruction}

**Trial Context:**
- Case: ${settings.caseDetail.title}
- Facts: ${settings.caseDetail.briefFacts}
- Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
- Mode: ${settings.practiceMode} law
- Judge: ${settings.judgePersonality.name}

You are Opposing Counsel ${settings.opposingCounselPersonality.name}. Challenge the user's arguments rigorously. NEVER break character. Keep responses under 120 words.`;

  return new GenericChat(buildInitialHistory(settings, 'opposingCounsel'), system);
};

export const sendMessageToChatStream = async (
  chat: Chat,
  message: string
): Promise<AsyncIterable<{ text: string }> | null> => {
  if (!chat) return null;
  const msg = message.trim() || 'Please proceed, Counsel.';
  return chat.sendMessageStream({ message: msg });
};

// ─── Performance analysis ─────────────────────────────────────────────────────

export const analyzeSessionPerformance = async (
  sessionRecord: SessionRecord,
  scoreBreakdown?: TrialScoreBreakdown
): Promise<PerformanceMetrics | null> => {
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
      return normalizePerformanceMetrics(parseJsonResponse(raw));
    } catch {
      const repairRaw = await callApi(
        [{ role: 'user', content: `Repair this response into the required raw JSON object only:\n\n${raw}` }],
        system,
      );
      return normalizePerformanceMetrics(parseJsonResponse(repairRaw));
    }
  } catch {
    return null;
  }
};

// ─── Drafting helpers ─────────────────────────────────────────────────────────

export const generateDraftingFacts = async (
  documentType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode,
  objective: string
): Promise<string> => {
  const lawText = Array.isArray(relevantLaws) ? relevantLaws.join('; ') : relevantLaws;
  const system = `You are a Legal Scenario Architect. Write one realistic fact-pattern paragraph for a ${practiceMode} law drafting exercise. Make the facts specific enough to support drafting choices. No intro or outro.`;
  return callApi([
    {
      role: 'user',
      content: `Document type: ${documentType}
Objective: ${objective}
Relevant law: ${lawText || 'Not specified'}

Generate a single fact scenario paragraph tailored to this exercise.`
    }
  ], system);
};

export const generateDraftingGuidance = async (
  task: DraftingTask,
  userDraft: string,
  generatedFacts: string,
  practiceMode: PracticeMode,
  sectionName?: string
): Promise<string> => {
  const lawText = Array.isArray(task.relevantLaws) ? task.relevantLaws.join('; ') : task.relevantLaws;
  const sectionPrompt = sectionName ? `Focus especially on the section titled "${sectionName}".` : 'Review the document as a whole.';
  const expectedSections = task.sections?.map(section => section.name).join(', ') || 'No predefined sections supplied.';
  const system = `You are an expert legal drafting mentor in ${practiceMode} law. Give concrete, task-specific feedback in four parts: strengths, missing legal elements, drafting risks, and next revisions. Avoid generic praise.`;
  return callApi([
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
};

export const getFilingProcedureInfo = async (
  draftType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode
): Promise<string> => {
  const lawText = Array.isArray(relevantLaws) ? relevantLaws.join('; ') : relevantLaws;
  const system = `You are a legal procedural guide for ${practiceMode} law. Provide a cautious bullet-point filing workflow, highlight jurisdiction-specific uncertainties, and end with a short training-use disclaimer.`;
  return callApi([
    {
      role: 'user',
      content: `Draft type: ${draftType}
Relevant law: ${lawText || 'Not specified'}

Provide the filing or submission workflow.`
    }
  ], system);
};

export const summarizeSearchResults = async (
  query: string,
  results: any[],
  practiceMode: PracticeMode | 'common'
): Promise<string> => {
  const system = `You are a Legal Research Assistant specializing in ${practiceMode} law. Synthesize the provided search results to answer the query: "${query}". Be concise, structured, and cite sources.`;
  const content = `Search query: "${query}"\n\nResults:\n${JSON.stringify(results)}`;
  return callApi([{ role: 'user', content }], system);
};

