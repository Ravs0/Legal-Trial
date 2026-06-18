import { Chat, ChatMessage, PerformanceMetrics, SessionRecord, SessionSettings, PracticeMode, DraftingTask } from '../types';
import { KOKU_SYSTEM_PROMPT } from '../kokuConfig';

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

async function callApi(messages: { role: string; content: string }[], system?: string): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
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

// ─── Session builders ─────────────────────────────────────────────────────────

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

export const startOversightChatSession = (appContext: any): Chat => {
  const system = `${KOKU_SYSTEM_PROMPT}

**Current App Context:**
- Route: ${appContext.pathname}
- Case (if any): ${appContext.caseTitle || 'None'}
- Practice Mode: ${appContext.practiceMode || 'None'}

Remember, you are Koku, the Oversight Spirit. Never break character.`;

  return new GenericChat([
    { role: 'user', content: 'You have manifested as the Oversight Spirit for this session. The user is now active in the Legal-Trial application.' },
    { role: 'assistant', content: 'Finally. Let\'s see what you\'re up to. Try not to embarrass yourself too much while I\'m watching.' }
  ], system);
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
  engagementScore?: number
): Promise<PerformanceMetrics | null> => {
  const transcriptText = sessionRecord.transcript
    .map(msg => {
      let name = 'User Counsel';
      if (msg.sender === 'judge') name = sessionRecord.settings.judgePersonality.name;
      if (msg.sender === 'opposingCounsel') name = sessionRecord.settings.opposingCounselPersonality.name;
      return `${name}: ${msg.text}`;
    })
    .join('\n\n');

  const engagementLine = engagementScore !== undefined
    ? `\n\n[Court Engagement Index: ${engagementScore} — this reflects the user's live courtroom activity: submissions made and objection reflexes landed within the timed window. Weight it modestly into responseQuality.]`
    : '';

  const system = `You are an Expert Legal Performance Analyst evaluating a mock trial in ${sessionRecord.settings.practiceMode} law.
Return ONLY a raw JSON object (no markdown, no explanation) with these integer keys (1–10):
argumentStrength, precedentUsage, constitutionalBasis, responseQuality, overallScore, feedback (string), improvementAreas (string[]).`;

  try {
    const raw = await callApi([{ role: 'user', content: `Transcript:\n${transcriptText}${engagementLine}\n\nGenerate the JSON.` }], system);
    let jsonStr = raw.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (parsed.legalBasis !== undefined && parsed.constitutionalBasis === undefined) {
      parsed.constitutionalBasis = parsed.legalBasis;
    }
    return parsed as PerformanceMetrics;
  } catch {
    return {
      argumentStrength: 0, precedentUsage: 0, constitutionalBasis: 0,
      responseQuality: 0, overallScore: 0,
      feedback: 'Analysis unavailable.', improvementAreas: [],
    };
  }
};

// ─── Drafting helpers ─────────────────────────────────────────────────────────

export const generateDraftingFacts = async (
  documentType: string,
  _relevantLaws: string[] | string,
  practiceMode: PracticeMode,
  objective: string
): Promise<string> => {
  const system = `You are a Legal Scenario Architect. Write a single clear paragraph of facts for a ${practiceMode} law drafting exercise. No intro/outro phrases.`;
  return callApi([{ role: 'user', content: `Generate facts for a ${documentType} to achieve: "${objective}".` }], system);
};

export const generateDraftingGuidance = async (
  task: DraftingTask,
  userDraft: string,
  _generatedFacts: string,
  practiceMode: PracticeMode,
  sectionName?: string
): Promise<string> => {
  const system = `You are an Expert Legal Drafting Mentor in ${practiceMode} law. Give specific, constructive feedback.`;
  const sectionPrompt = sectionName ? ` Specifically focus on the "${sectionName}" section of the document.` : '';
  return callApi([{ role: 'user', content: `Review this ${task.type} draft:${sectionPrompt}\n\n${userDraft}` }], system);
};

export const getFilingProcedureInfo = async (
  draftType: string,
  _relevantLaws: string[] | string,
  practiceMode: PracticeMode
): Promise<string> => {
  const system = `You are a Legal Procedural Guide for ${practiceMode} law. Provide bullet-point steps. Add a disclaimer at end.`;
  return callApi([{ role: 'user', content: `Filing procedure for ${draftType}.` }], system);
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

