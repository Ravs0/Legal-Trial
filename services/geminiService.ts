import { ChatMessage, PerformanceMetrics, SessionRecord, SessionSettings, PracticeMode, DraftingTask, DraftingSection, Chat } from '../types';

interface ApiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export const getApiConfig = (): ApiConfig | null => {
  // Try DeepSeek via NVIDIA
  if (process.env.DEEPSEEK_NVIDIA_API_KEY && process.env.DEEPSEEK_NVIDIA_API_KEY.length > 10) {
    return {
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      apiKey: process.env.DEEPSEEK_NVIDIA_API_KEY,
      model: "nvidia/deepseek-r1"
    };
  }
  // Try DeepSeek Native
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.length > 10) {
    return {
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: "deepseek-chat"
    };
  }
  // Try Groq
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10) {
    return {
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile"
    };
  }
  // Try Kimi
  if (process.env.KIMI_API_KEY && process.env.KIMI_API_KEY.length > 10) {
    return {
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      apiKey: process.env.KIMI_API_KEY,
      model: "moonshotai/kimi-k2.5" // Modify if Kimi's exact model tag differs
    };
  }
  // Try Gemini Rest Fallback
  const gKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (gKey && gKey.length > 10 && gKey !== 'YOUR_API_KEY_HERE') {
    return {
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey}`,
      apiKey: gKey,
      model: "gemini-2.5-flash"
    };
  }
  return null;
}

const parseSseChunk = (line: string): string => {
  if (!line.startsWith('data: ')) return '';
  const dataStr = line.replace(/^data: /, '').trim();
  if (dataStr === '[DONE]') return '';
  try {
    const data = JSON.parse(dataStr);
    if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
      return data.choices[0].delta.content;
    }
  } catch (e) { }
  return '';
}

class GenericChat implements Chat {
  history: { role: string, content: string }[];
  systemInstruction: string;
  apiConfig: ApiConfig;

  constructor(history: { role: string, content: string }[], systemInstruction: string, apiConfig: ApiConfig) {
    this.history = history;
    this.systemInstruction = systemInstruction;
    this.apiConfig = apiConfig;
  }

  async *sendMessageStream({ message }: { message: string }): AsyncIterable<any> {
    this.history.push({ role: 'user', content: message });

    let messages = [
      { role: 'system', content: this.systemInstruction },
      ...this.history
    ];

    // If testing Gemini native REST fallback block (not sse):
    if (this.apiConfig.model.includes('gemini')) {
      const response = await fetch(this.apiConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: { text: this.systemInstruction } },
          contents: this.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: { text: m.content } }))
        })
      });
      if (!response.ok) throw new Error("Gemini API failed limit or error");
      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      this.history.push({ role: 'assistant', content: text });
      yield { text: () => text };
      return;
    }

    // OpenAI Compatible SSE Stream
    const response = await fetch(this.apiConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: this.apiConfig.model,
        messages: messages,
        stream: true,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error ${response.status}: ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullResponseText = "";

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (let line of lines) {
          const chunkText = parseSseChunk(line);
          if (chunkText) {
            fullResponseText += chunkText;
            yield { text: () => chunkText };
          }
        }
      }
    }
    this.history.push({ role: 'assistant', content: fullResponseText });
  }
}

const generateContent = async (apiConfig: ApiConfig, system: string, prompt: string): Promise<string> => {
  // Gemini fallback logic
  if (apiConfig.model.includes('gemini')) {
    const response = await fetch(apiConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: { text: system } },
        contents: [{ parts: { text: prompt } }]
      })
    });
    if (!response.ok) throw new Error("Gemini fallback fetch failed");
    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // OpenAI Compatible
  const response = await fetch(apiConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Error: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

const createInitialChatHistory = (settings: SessionSettings, persona: 'judge' | 'opposingCounsel'): { role: string, content: string }[] => {
  const modeInfo = settings.practiceMode ? ` This is a ${settings.practiceMode} law context.` : '';
  if (persona === 'judge') {
    return [
      { role: 'user', content: `Your Honor, we are ready to begin the mock trial for the case: ${settings.caseDetail.title}.${modeInfo} I represent my client and will present arguments. An opposing counsel, ${settings.opposingCounselPersonality.name}, is also present.` },
      { role: 'assistant', content: `Very well, counsel. You may proceed with your arguments regarding ${settings.caseDetail.title}. I will hear from you and from ${settings.opposingCounselPersonality.name}. The Court expects rigorous arguments reflective of the ${settings.practiceMode} legal tradition.` },
    ];
  } else {
    return [
      { role: 'user', content: `Advocate ${settings.opposingCounselPersonality.name}, we are commencing the mock trial for ${settings.caseDetail.title}.${modeInfo} I will be presenting my arguments first. The presiding judge is ${settings.judgePersonality.name}.` },
      { role: 'assistant', content: `Understood, counsel. I am prepared to hear your arguments for ${settings.caseDetail.title} and present my counter-arguments in this ${settings.practiceMode} law setting. Let us proceed under the guidance of ${settings.judgePersonality.name}.` },
    ];
  }
};

export const startJudgeChatSession = (settings: SessionSettings): Chat | null => {
  const config = getApiConfig();
  if (!config) return null;
  const caseContext = `
    **Case Information:**
    - Title: ${settings.caseDetail.title}
    - Brief Facts: ${settings.caseDetail.briefFacts}
    - Key Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
    - Relevant Articles: ${settings.caseDetail.relevantArticlesSections}
    - Practice Mode: ${settings.practiceMode} law.

    **Your Role & Instructions:**
    - You are Presiding Judge: ${settings.judgePersonality.name}.
    - The user is the presenter.
    - Opposing Counsel: ${settings.opposingCounselPersonality.name} will present counter-arguments.
    - Note: This is an immersive simulation. NEVER break character. Limit your responses to under 150 words. Moderation and legal rigor are expected.
  `;
  const system = `${settings.judgePersonality.systemInstruction}\n\n**Trial Context & Instructions:**\n${caseContext}`;
  return new GenericChat(createInitialChatHistory(settings, 'judge'), system, config);
};

export const startOpposingCounselChatSession = (settings: SessionSettings): Chat | null => {
  const config = getApiConfig();
  if (!config) return null;
  const caseContext = `
    **Case Information:**
    - Title: ${settings.caseDetail.title}
    - Brief Facts: ${settings.caseDetail.briefFacts}
    - Key Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
    - Relevant Articles: ${settings.caseDetail.relevantArticlesSections}
    - Practice Mode: ${settings.practiceMode} law.

    **Your Role:**
    - You are Opposing Counsel: ${settings.opposingCounselPersonality.name}.
    - Your goal is to effectively challenge the user's arguments within the ${settings.practiceMode} legal framework. Do not break character. 
  `;
  const system = `${settings.opposingCounselPersonality.systemInstruction}\n\n**Trial Context:**\n${caseContext}`;
  return new GenericChat(createInitialChatHistory(settings, 'opposingCounsel'), system, config);
};

export const sendMessageToChatStream = async (chat: Chat, message: string): Promise<AsyncIterable<any> | null> => {
  const config = getApiConfig();
  if (!config) return null;
  if (!chat) return null;
  try {
    const validMessage = (typeof message === 'string' && message.trim() !== '') ? message.trim() : "Counsel, please articulate your point.";
    return await chat.sendMessageStream({ message: validMessage });
  } catch (error) {
    console.error("Error sending message to chat:", error);
    throw error;
  }
};

export const analyzeSessionPerformance = async (sessionRecord: SessionRecord): Promise<PerformanceMetrics | null> => {
  const config = getApiConfig();
  if (!config) return null;

  const transcriptText = sessionRecord.transcript
    .map(msg => {
      let senderName = 'User Counsel';
      if (msg.sender === 'judge') senderName = sessionRecord.settings.judgePersonality.name;
      if (msg.sender === 'opposingCounsel') senderName = sessionRecord.settings.opposingCounselPersonality.name;
      return `${senderName}: ${msg.text}`;
    }).join('\n\n');

  const systemInstruction = `
  You are an Expert Legal Performance Analyst evaluating a mock trial transcript in ${sessionRecord.settings.practiceMode} law.
  Analyze logic, basis, tone. Provide output strictly as a JSON object with keys: 
  "argumentStrength", "precedentUsage", "constitutionalBasis", "responseQuality", "overallScore" (all integers 1-10), "feedback" (string), "improvementAreas" (array of strings).
  NO trailing commas, NO markdown wrap, JUST the raw JSON.`;

  const prompt = `Here is the transcript:\n${transcriptText}\nGenerate the JSON.`;

  try {
    const responseText = await generateContent(config, systemInstruction, prompt);
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.substring(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.substring(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    jsonStr = jsonStr.trim();

    let parsedData = JSON.parse(jsonStr);

    if (parsedData.legalBasis !== undefined && parsedData.constitutionalBasis === undefined) {
      parsedData.constitutionalBasis = parsedData.legalBasis;
    }

    return parsedData as PerformanceMetrics;
  } catch (error) {
    return {
      argumentStrength: 0, precedentUsage: 0, constitutionalBasis: 0, responseQuality: 0, overallScore: 0,
      feedback: "Analysis error.", improvementAreas: ["Failed parsing model response."]
    };
  }
};

export const generateDraftingFacts = async (documentType: string, relevantLaws: string[] | string, practiceMode: PracticeMode, objective: string): Promise<string> => {
  const config = getApiConfig();
  if (!config) return "Error: AI disconnected.";
  const system = `You are a Legal Scenario Architect generating facts for drafting exercises in ${practiceMode} law. Provide a 1-paragraph clear scenario. DO NOT use introductory/closing phrases.`;
  const prompt = `Generate drafting facts for a ${documentType} aiming to achieve: "${objective}".`;
  return await generateContent(config, system, prompt);
};

export const generateDraftingGuidance = async (task: DraftingTask, userDraft: string, generatedFacts: string, practiceMode: PracticeMode, selectedSectionName?: string | null): Promise<string> => {
  const config = getApiConfig();
  if (!config) return "Error: AI disconnected.";
  const system = `You are an Expert Legal Drafting Mentor in ${practiceMode} law. Constructive feedback in clear text.`;
  const prompt = `Critique this draft for a ${task.type}:\n\n${userDraft}`;
  return await generateContent(config, system, prompt);
};

export const getFilingProcedureInfo = async (draftType: string, relevantLaws: string[] | string, practiceMode: PracticeMode): Promise<string> => {
  const config = getApiConfig();
  if (!config) return "Error: AI disconnected.";
  const system = `You are a Legal Procedural Guide in ${practiceMode} law. Provide clear bullet points of common procedural steps.`;
  const prompt = `Filing procedure for ${draftType}. Add disclaimer at end.`;
  return await generateContent(config, system, prompt);
};
