import { Chat, ChatMessage, PerformanceMetrics, SessionRecord, SessionSettings, PracticeMode, DraftingTask } from '../types';
import { KOKU_SYSTEM_PROMPT } from '../kokuConfig';

// ─── Core API call ────────────────────────────────────────────────────────────

// ─── Mock Fallbacks ───────────────────────────────────────────────────────────

function getMockResponse(messages: { role: string; content: string }[], system?: string): string {
  const sys = (system || '').toLowerCase();
  const lastMsg = messages[messages.length - 1]?.content || '';
  const lastMsgLower = lastMsg.toLowerCase();

  // 1. Performance Analysis
  if (sys.includes('performance') || sys.includes('evaluating a mock trial')) {
    return JSON.stringify({
      argumentStrength: 8,
      precedentUsage: 7,
      constitutionalBasis: 8,
      responseQuality: 8,
      overallScore: 82,
      feedback: "Counsel presented a cohesive, structured argument highlighting the core breach of covenant. To improve, reference specific sub-clauses of the liability limitation section and expand on the estoppel defense.",
      improvementAreas: [
        "Include references to appellate court judgments on limitation clauses.",
        "Strengthen the damages mitigation defense arguments."
      ]
    });
  }

  // 2. Scenario Fact Generation
  if (sys.includes('scenario architect') || lastMsgLower.includes('generate facts')) {
    if (lastMsgLower.includes('plaint') || lastMsgLower.includes('eviction') || lastMsgLower.includes('recovery')) {
      return "On April 12, 2026, the Plaintiff entered into a written lease agreement with the Defendant for a commercial showroom. Under Clause 4 of the lease, monthly rent of INR 1,50,000 is payable by the 5th of each calendar month. The Defendant paid rent regularly until September 2026, but defaulted thereafter. Despite three formal legal notices dated October 15, November 10, and December 5, 2026, demanding the payment of outstanding rent and vacant possession, the Defendant continues to occupy the premises without payment. The Plaintiff now seeks recovery of possession, arrears, and mesne profits.";
    }
    if (lastMsgLower.includes('contract') || lastMsgLower.includes('agreement')) {
      return "This Software Development and Services Agreement is entered into by and between Alpha Solutions Private Limited ('Developer') and Beta Enterprises Inc. ('Client'). The Developer agrees to build a customized enterprise inventory management software as specified in Schedule A within four months. In consideration, the Client agrees to pay a total contract sum of USD 85,000, split across four milestone payments. Section 8 details intellectual property rights vesting solely in the Client upon full payment, and Section 12 establishes a mutual cap on liability at the total amount paid under the agreement.";
    }
    // Default mock facts
    return "On June 15, 2025, the Plaintiff (a supplier of industrial electronics) and the Defendant (a local assembly factory) entered into a supply agreement. The Plaintiff delivered 500 microprocessors on September 1, 2025, which the Defendant integrated into consumer devices. By October 15, the assembly line reported a 40% failure rate due to quality defects in the microprocessors. The Defendant refused to pay the outstanding invoice of USD 45,000, claiming indemnity for damaged consumer units. The Plaintiff disputes the default and demands immediate payment.";
  }

  // 3. Filing Procedure Info
  if (sys.includes('procedural guide') || lastMsgLower.includes('filing procedure')) {
    return `### Filing Procedure Overview
1. **Pre-requisites**: Issue a 15-day statutory demand or notice to the counter-party.
2. **Drafting**: Prepare the Plaint/Petition along with a verifying affidavit, witness lists, and copies of key document exhibits.
3. **Court Fee**: Compute the court fee based on the valuation of the subject matter under the Court Fees Act.
4. **Filing**: Present the case at the filing counter or online portal of the competent commercial court having local and pecuniary jurisdiction.
5. **Scrutiny**: Address any objections raised by the registry during scrutiny within the specified time.

*Disclaimer: This information is for educational simulation purposes only and does not constitute formal legal advice.*`;
  }

  // 4. Drafting Guidance / Feedback
  if (sys.includes('drafting mentor') || lastMsgLower.includes('review this')) {
    return `### Professional Drafting Review
1. **Structure & Form**: The formatting is highly structured and conforms to professional standards. The introductory preamble is clearly stated.
2. **Grammar of Obligation**: Excellent use of "shall" for covenants and "represents" for factual assertions.
3. **Strengths**: Clear identification of the parties, precise payment milestones, and robust jurisdiction clauses.
4. **Areas of Improvement**:
   - In Section 4 (Limitation of Liability), clarify whether the cap applies to indemnification claims.
   - In Section 9 (Dispute Resolution), specify the seat and venue of arbitration to prevent jurisdiction disputes.`;
  }

  // 5. Judge Personality Response
  if (sys.includes('judge')) {
    return "The Court has heard your submission, Counsel. While your argument on the contractual obligation is noted, how do you address the question of the waiver under the subsequent correspondence? Please address this point directly.";
  }

  // 6. Opposing Counsel Personality Response
  if (sys.includes('opposing counsel')) {
    return "My learned friend is overlooking the explicit terms of Clause 12. The contract explicitly excludes liability for consequential damages, making the current claim completely untenable.";
  }

  // Default fallback
  return "I have reviewed your points, Counsel. Let us examine the documentary evidence in detail to substantiate this position.";
}

// ─── Core API call ────────────────────────────────────────────────────────────

async function callApi(messages: { role: string; content: string }[], system?: string): Promise<string> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error ${res.status}`);
    }
    const data = await res.json();
    return data.text || '';
  } catch (error) {
    console.warn("API call failed, falling back to mock response:", error);
    return getMockResponse(messages, system);
  }
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
      console.warn("API stream failed, falling back to mock response:", error);
      const mockText = getMockResponse(this.history, this.system);
      
      // Simulate streaming the mock text in chunks
      const words = mockText.split(' ');
      let accumulated = '';
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i === words.length - 1 ? '' : ' ');
        accumulated += chunk;
        yield { text: chunk };
        await new Promise(resolve => setTimeout(resolve, 35)); // 35ms delay between words to simulate stream
      }
      this.history.push({ role: 'assistant', content: accumulated });
    }
  }
}

// ─── Config check (for getApiConfig compatibility) ───────────────────────────

export const getApiConfig = (): boolean => true; // always true — server handles key checks

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
  sessionRecord: SessionRecord
): Promise<PerformanceMetrics | null> => {
  const transcriptText = sessionRecord.transcript
    .map(msg => {
      let name = 'User Counsel';
      if (msg.sender === 'judge') name = sessionRecord.settings.judgePersonality.name;
      if (msg.sender === 'opposingCounsel') name = sessionRecord.settings.opposingCounselPersonality.name;
      return `${name}: ${msg.text}`;
    })
    .join('\n\n');

  const system = `You are an Expert Legal Performance Analyst evaluating a mock trial in ${sessionRecord.settings.practiceMode} law.
Return ONLY a raw JSON object (no markdown, no explanation) with these integer keys (1–10):
argumentStrength, precedentUsage, constitutionalBasis, responseQuality, overallScore, feedback (string), improvementAreas (string[]).`;

  try {
    const raw = await callApi([{ role: 'user', content: `Transcript:\n${transcriptText}\n\nGenerate the JSON.` }], system);
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
