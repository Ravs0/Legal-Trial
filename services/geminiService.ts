
import { GoogleGenAI, Chat, GenerateContentResponse, Part, GenerateContentParameters, Content } from "@google/genai";
import { ChatMessage, PerformanceMetrics, SessionRecord, SessionSettings, PracticeMode, DraftingTask, DraftingSection } from '../types';

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;

if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.error("API_KEY environment variable is not set. Gemini API functionality will be disabled.");
}

export const getAiClient = (): GoogleGenAI | null => ai;

const createInitialChatHistory = (settings: SessionSettings, persona: 'judge' | 'opposingCounsel'): Content[] => {
  const userRole = "user";
  const modelRole = "model";
  const modeInfo = settings.practiceMode ? ` This is a ${settings.practiceMode} law context.` : '';

  if (persona === 'judge') {
    return [
      { role: userRole, parts: [{ text: `Your Honor, we are ready to begin the mock trial for the case: ${settings.caseDetail.title}.${modeInfo} I represent my client and will present arguments. An opposing counsel, ${settings.opposingCounselPersonality.name}, is also present.` }] },
      { role: modelRole, parts: [{ text: `Very well, counsel. You may proceed with your arguments regarding ${settings.caseDetail.title}. I will hear from you and from ${settings.opposingCounselPersonality.name}. The Court expects rigorous arguments reflective of the ${settings.practiceMode} legal tradition.` }] },
    ];
  } else { // opposingCounsel
    return [
      { role: userRole, parts: [{ text: `Advocate ${settings.opposingCounselPersonality.name}, we are commencing the mock trial for ${settings.caseDetail.title}.${modeInfo} I will be presenting my arguments first. The presiding judge is ${settings.judgePersonality.name}.` }] },
      { role: modelRole, parts: [{ text: `Understood, counsel. I am prepared to hear your arguments for ${settings.caseDetail.title} and present my counter-arguments in this ${settings.practiceMode} law setting. Let us proceed under the guidance of ${settings.judgePersonality.name}.` }] },
    ];
  }
};

export const startJudgeChatSession = (settings: SessionSettings): Chat | null => {
  if (!ai) return null;

  const caseContext = `
    **Case Information:**
    - Title: ${settings.caseDetail.title}
    - Brief Facts: ${settings.caseDetail.briefFacts}
    - Key Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
    - Relevant Articles/Sections/Instruments: ${settings.caseDetail.relevantArticlesSections}
    - Practice Mode: ${settings.practiceMode} law.

    **Your Role & Instructions:**
    - You are Presiding Judge: ${settings.judgePersonality.name}.
    - Counsel (User): The user is presenting arguments.
    - Opposing Counsel: ${settings.opposingCounselPersonality.name} will present counter-arguments.
    - Your Task: Conduct a realistic mock trial. Adhere strictly to your defined judicial personality (see below). You will receive input combining user's arguments and opposing counsel's responses. Moderate, ask probing questions to both, and guide proceedings. Ensure legal reasoning and tone align with ${settings.practiceMode} standards.
    - Application Aesthetic: The app has a professional, premium Oxford Navy & Gold glassmorphic theme with sleek typography and subtle gold accents. Your responses should be sophisticated and fit this aesthetic.
  `;

  const chat: Chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: createInitialChatHistory(settings, 'judge'),
    config: {
      systemInstruction: `${settings.judgePersonality.systemInstruction}\n\n**Trial Context & Instructions:**\n${caseContext}`,
    }
  });
  return chat;
};

export const startOpposingCounselChatSession = (settings: SessionSettings): Chat | null => {
  if (!ai) return null;

  const caseContext = `
    **Case Information:**
    - Title: ${settings.caseDetail.title}
    - Brief Facts: ${settings.caseDetail.briefFacts}
    - Key Legal Issues: ${settings.caseDetail.legalIssues.join(', ')}
    - Relevant Articles/Sections/Instruments: ${settings.caseDetail.relevantArticlesSections}
    - Practice Mode: ${settings.practiceMode} law.

    **Your Role & Instructions:**
    - You are Opposing Counsel: ${settings.opposingCounselPersonality.name}.
    - Counsel (User): The user is the counsel you are arguing against.
    - Presiding Judge: ${settings.judgePersonality.name}.
    - Your Task: Engage in a realistic mock trial. Adhere strictly to your defined opposing counsel personality (see below). Your primary goal is to effectively challenge the user's arguments within the ${settings.practiceMode} legal framework. The judge will moderate.
    - Application Aesthetic: The app has a professional, premium Oxford Navy & Gold glassmorphic theme with sleek typography and subtle gold accents. Your responses should be sophisticated.
  `;

  const chat: Chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: createInitialChatHistory(settings, 'opposingCounsel'),
    config: {
      systemInstruction: `${settings.opposingCounselPersonality.systemInstruction}\n\n**Trial Context & Instructions:**\n${caseContext}`,
    }
  });
  return chat;
};


export const sendMessageToChatStream = async (
  chat: Chat,
  message: string
): Promise<AsyncIterable<GenerateContentResponse> | null> => {
  if (!ai) return null;
  try {
    const validMessage = (typeof message === 'string' && message.trim() !== '') ? message.trim() : "Counsel, please articulate your point.";
    const result = await chat.sendMessageStream({ message: validMessage });
    return result;
  } catch (error) {
    console.error("Error sending message to chat (stream):", error);
    throw error;
  }
};


export const analyzeSessionPerformance = async (sessionRecord: SessionRecord): Promise<PerformanceMetrics | null> => {
  if (!ai) return null;

  const transcriptText = sessionRecord.transcript
    .map(msg => {
      let senderName = 'User Counsel';
      if (msg.sender === 'judge') senderName = sessionRecord.settings.judgePersonality.name;
      if (msg.sender === 'opposingCounsel') senderName = sessionRecord.settings.opposingCounselPersonality.name;
      return `${senderName}: ${msg.text}`;
    })
    .join('\n\n');

  const systemInstruction = `
  **AI Role:** You are an Expert Legal Performance Analyst.
  **Input:** A transcript from a mock trial simulation.
  **Task:** Evaluate the **User Counsel's** performance based on the transcript, considering the specified legal context, judge, and opposing counsel personalities.
  **Methodology:**
    1. Analyze User Counsel's arguments for logical coherence, evidentiary support, and persuasiveness.
    2. Assess User Counsel's use and application of relevant legal authorities (precedents, statutes, principles) for the ${sessionRecord.settings.practiceMode} context.
    3. Evaluate how well User Counsel grounded their arguments in core legal principles (e.g., constitutional law for Indian mode; treaties, customary law for international mode).
    4. Judge the clarity, directness, and effectiveness of User Counsel's responses to questions from the Judge and challenges from Opposing Counsel.
    5. Provide a holistic overall score.
    6. Generate constructive, balanced feedback (3-5 sentences) highlighting strengths and weaknesses, specific to interactions and the ${sessionRecord.settings.practiceMode} context.
    7. Suggest 2-3 specific, actionable improvement areas.
  **Output Specification:**
    - Output MUST be a single, valid JSON object.
    - The JSON object MUST contain keys: "argumentStrength", "precedentUsage", "constitutionalBasis", "responseQuality", "overallScore" (all integers 1-10), "feedback" (string), "improvementAreas" (array of strings).
    - DO NOT include any text, greetings, or markdown formatting (like \`\`\`json) before or after the JSON object.
  `;

  const prompt = `
    **Mock Trial Details for Analysis:**
    - Mode: ${sessionRecord.settings.practiceMode} law
    - Case: ${sessionRecord.settings.caseDetail.title}
    - User Role: User Counsel (to be evaluated)
    - AI Judge: ${sessionRecord.settings.judgePersonality.name}
    - AI Opposing Counsel: ${sessionRecord.settings.opposingCounselPersonality.name}
    - Application Aesthetic Hint: User sees this analysis in a professional, Oxford Navy & Gold glassmorphic app. Your tone should be professional.

    **Transcript:**
    \`\`\`
    ${transcriptText}
    \`\`\`

    Analyze and provide performance metrics in the specified JSON format.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    let parsedData = JSON.parse(jsonStr);

    // Handle potential variations in key naming from LLM
    if (parsedData.legalBasis !== undefined && parsedData.constitutionalBasis === undefined) {
      parsedData.constitutionalBasis = parsedData.legalBasis;
      delete parsedData.legalBasis;
    }
    if (parsedData.legalPrinciples !== undefined && parsedData.constitutionalBasis === undefined) {
      parsedData.constitutionalBasis = parsedData.legalPrinciples;
      delete parsedData.legalPrinciples;
    }


    const requiredKeys: Array<keyof PerformanceMetrics> = [
      'argumentStrength', 'precedentUsage', 'constitutionalBasis',
      'responseQuality', 'overallScore', 'feedback', 'improvementAreas'
    ];
    for (const key of requiredKeys) {
      if (!(key in parsedData)) {
        if (key === 'constitutionalBasis' && ('legalBasis' in parsedData || 'legalPrinciples' in parsedData)) continue;
        throw new Error(`Missing key ${key} in parsed performance metrics. Received: ${jsonStr}`);
      }
    }
    return parsedData as PerformanceMetrics;

  } catch (error) {
    console.error("Error analyzing session performance:", error);
    return {
      argumentStrength: 0,
      precedentUsage: 0,
      constitutionalBasis: 0,
      responseQuality: 0,
      overallScore: 0,
      feedback: "Could not generate performance analysis due to an error. Please check the console for details. The AI may have returned an unexpected format or encountered a policy restriction.",
      improvementAreas: ["Review API response or error logs.", "Ensure the transcript is not excessively long or contains unusual characters.", "If the error persists, try a different session or simplify the interaction."],
    };
  }
};


// --- DRAFTING STUDIO SERVICE FUNCTIONS (DSPy-inspired Prompting) ---

export const generateDraftingFacts = async (
  documentType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode,
  objective: string
): Promise<string> => {
  if (!ai) return "Error: AI client not initialized. Cannot generate facts.";

  const relevantLawsText = Array.isArray(relevantLaws) ? relevantLaws.join(', ') : relevantLaws;

  const systemInstruction = `
  **AI Role:** You are a Legal Scenario Architect. Your primary function is to generate factual scenarios for legal drafting exercises.
  **Task Definition:** Construct a concise and plausible set of facts suitable for drafting a legal document.
  **Inputs Provided to You:**
    - Document Type User Will Draft: '${documentType}'
    - Governing Legal Context: ${practiceMode} law, specifically concerning ${relevantLawsText}.
    - User's Drafting Objective: "${objective}"
    - Application Aesthetic: The app has a professional, premium Oxford Navy & Gold glassmorphic theme with sleek typography and subtle gold accents.
  **Fact Generation Process & Guidelines:**
    1.  **Relevance:** The facts you generate must directly lead to and necessitate the drafting of the specified '${documentType}' to achieve the given '${objective}'.
    2.  **Clarity & Sufficiency:** Facts should be clear, unambiguous, and provide enough specific detail for a user to begin drafting (e.g., names, dates, locations, key actions/events). Avoid excessive complexity or ambiguity. Typically 3-5 key factual points are sufficient.
    3.  **Consistency:** Ensure facts are internally consistent and align with the specified ${practiceMode} legal context and the nuances of ${relevantLawsText}.
    4.  **Format:** Present facts as a list using asterisks (e.g., "* Fact 1 detail.") OR as a single, coherent paragraph (approximately 50-120 words). Ensure the output is clean and directly usable.
  **Output Specification:**
    - Your response MUST ONLY be the generated facts.
    - DO NOT include any introductory phrases (e.g., "Here are the facts:", "Certainly, I can help with that.").
    - DO NOT include any concluding remarks or pleasantries.
  **Error Handling Protocol:**
    - If the request is too ambiguous, or if generating facts for the given combination of '${documentType}', '${objective}', and laws would inherently involve highly sensitive, unethical, or inappropriate content (even for a fictional exercise), you MUST return a polite error message. This message MUST start with "Error:", for example: "Error: Could not generate specific facts for this scenario due to content sensitivity concerns. Please select a different document type or refine the objective."
  `;

  const prompt = `Generate facts for drafting a ${documentType}. Ensure the facts are specific to this document type and its objective: "${objective}". The legal context is ${practiceMode} law, concerning ${relevantLawsText}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    const textResponse = response.text;
    if (textResponse && textResponse.trim() !== "" && !textResponse.trim().toLowerCase().startsWith("error:")) {
      // Basic check for some substance, like presence of a bullet or decent length
      if (textResponse.includes("*") || textResponse.length > 40) {
        return textResponse.trim();
      }
      // If response is very short and not an error, it might be a malformed success from AI
      return `Error: AI provided an unusual or insufficient response for facts: "${textResponse.trim()}". This may be due to the specificity of the request. Please try a different task or rephrase your objective.`;
    }
    return `Error: AI returned an empty response or a response that seems like an error message: "${textResponse ? textResponse.trim() : 'Empty Response'}". Please try again or select a different drafting task.`;
  } catch (error) {
    console.error("Error generating drafting facts:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("SAFETY") || errorMsg.toLowerCase().includes("blocked") || errorMsg.toLowerCase().includes("policy")) {
      return `Error: Fact generation for '${documentType}' was blocked due to safety settings or content policy. This can happen with certain sensitive topics. Please select a different document type or modify the objective. (Details: ${errorMsg})`;
    }
    return `Error: An internal error occurred while generating facts for '${documentType}': ${errorMsg}. Please try again. If the problem persists, check the API key or network connection.`;
  }
};


export const generateDraftingGuidance = async (
  task: DraftingTask,
  userDraft: string,
  generatedFacts: string,
  practiceMode: PracticeMode,
  selectedSectionName?: string | null
): Promise<string> => {
  if (!ai) return "Error: AI client not initialized. Cannot provide guidance.";

  const relevantLawsText = Array.isArray(task.relevantLaws) ? task.relevantLaws.join(', ') : task.relevantLaws;

  let sectionFocusInstruction = "";
  if (selectedSectionName) {
    sectionFocusInstruction = `**Primary Focus Area (User Specified):** The user has specifically requested feedback on the **'${selectedSectionName}'** section of their draft.
    - Your critique should predominantly address this section. Evaluate its content accuracy against the provided facts, its structural soundness, its legal correctness concerning '${relevantLawsText}', and its overall contribution to the document's objective: "${task.objective}".
    - After providing detailed feedback on the '${selectedSectionName}', offer a brief (1-2 sentence) overall assessment of the entire draft, noting any critical global issues.`;
  } else {
    sectionFocusInstruction = `**Primary Focus Area:** Your review should be comprehensive, covering the entire draft.`;
  }

  const systemInstruction = `
  **AI Role:** You are an Expert Legal Drafting Mentor specializing in ${practiceMode} law. Your purpose is to provide detailed, constructive feedback to a user learning legal drafting.
  **Task Definition:** Analyze the user's submitted draft of a '${task.type}' and provide actionable guidance for improvement.
  **Context for Your Analysis (Inputs Provided to You):**
    - Document Type Being Drafted: '${task.type}'
    - User's Stated Objective for this Draft: "${task.objective}"
    - Relevant Legal Framework: ${relevantLawsText}
    - Factual Scenario (User was instructed to base their draft on these facts):
      \`\`\`
      ${generatedFacts}
      \`\`\`
    - Application Aesthetic: The app has a professional, premium Oxford Navy & Gold glassmorphic theme with sleek typography and subtle gold accents. Your feedback should be professional and clearly formatted.
  ${sectionFocusInstruction}

  **Feedback Methodology & Structure (Your Thought Process):**
  1.  **Handling of Empty or Rudimentary Drafts:**
      - If the user's draft is effectively empty (e.g., placeholder text like "draft here", less than ~20 words, or clearly not a genuine attempt at drafting this specific document type), DO NOT critique the non-existent content.
      - Instead, provide **initial, actionable guidance** on how to BEGIN drafting this specific document ('${task.type}'). 
      - Suggest key sections, opening statements, or structural elements relevant to the objective ("${task.objective}") and the provided facts.
      - ${selectedSectionName ? `If a section focus ('${selectedSectionName}') is given, tailor this initial guidance to that section first. Explain its purpose and what content it should generally include in relation to the objective and facts. Then briefly mention other key starting points for the document.` : `Suggest starting with the most crucial opening sections or elements for this document type (e.g., "For a ${task.type}, you typically start with the Court title and party descriptions. Then, articulate the core facts constituting your cause of action..."). Be specific.`}
      - Your initial guidance should be concise (2-3 key points), encouraging, and provide a clear path forward.
  2.  **For Substantive Drafts (Main Feedback Flow):**
      - **Adherence to Facts:** Critically assess if the draft is consistent with and effectively utilizes ALL relevant aspects of the provided facts. Point out any deviations, omissions, or misinterpretations of the facts.
      - **Legal Accuracy & Completeness:** Does the draft correctly apply the principles of ${relevantLawsText}? Are all necessary legal elements for a '${task.type}' (given the facts, objective, and ${practiceMode} context) present and correctly formulated? Mention if key clauses or averments typically found in such a document are missing.
      - **Fulfillment of Objective:** Does the draft, as written, effectively work towards achieving the stated objective: "${task.objective}"? Are there stronger ways to frame arguments or clauses to meet this objective?
      - **Clarity, Structure & Language:** Is the draft well-organized, logical, and easy to understand? Is the language precise, professional, and appropriate for legal drafting in ${practiceMode}? Avoid jargon where simpler terms suffice, unless it's legally required terminology. Point out awkward phrasing or grammatical errors if significant.
      - **Formatting/Style (Briefly, if major issues):** Any significant departures from standard legal drafting conventions for ${practiceMode}? (e.g., incorrect party descriptions, missing verification if typically required).
  3.  **Output Format Specification for Substantive Drafts:**
      - Use **bold** for key terms, section titles in your feedback, or to highlight specific phrases from the user's draft you are referencing.
      - Present feedback in a structured manner. A good structure could be:
          - **Overall Impression:** (1-2 sentences)
          - **Strengths:** (1-2 specific points, if genuinely present)
          - **Areas for Improvement:** (Use bullet points for clarity. Be specific and provide examples or suggest alternative phrasing where helpful. Focus on the most impactful 2-4 areas.)
      - Offer specific, actionable suggestions. Instead of just saying "this is unclear," explain *why* it's unclear and *how* it could be improved.
      - Ask guiding questions to prompt the user to reflect on their choices (e.g., "Have you considered how this clause might be interpreted by the opposing party?").
      - Maintain a supportive, critical, and highly instructive tone. Remember, this is a learning tool. Be encouraging.
  **Error Handling Protocol:**
    - If the draft or task itself is problematic (e.g., appears to violate safety policies, is excessively long and unmanageable for feedback, or is too garbled to understand), you MUST return a polite error message. This message MUST start with "Error:", explaining the issue briefly. Example: "Error: The provided draft is too fragmented to provide meaningful feedback. Please try to structure it more clearly."
  `;

  const draftContentForPrompt = userDraft.trim() === '' || userDraft.trim().length < 20 ?
    '(User has submitted a very short or empty draft. Please follow instructions for providing initial guidance on how to start this specific draft type based on the objective and facts.)'
    : userDraft;

  const prompt = `
    **User's Current Draft for '${task.type}':**
    \`\`\`
    ${draftContentForPrompt}
    \`\`\`
    ${selectedSectionName ? `\n(User has also specified a focus on the '${selectedSectionName}' section. Please prioritize feedback for this section as per instructions.)` : ''}

    Please provide your detailed critique, suggestions, and guidance based on the methodology outlined.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    const textResponse = response.text;
    if (textResponse && textResponse.trim() !== "" && !textResponse.trim().toLowerCase().startsWith("error:")) {
      return textResponse.trim();
    }
    return `Error: AI returned an empty or error-like feedback response: "${textResponse ? textResponse.trim() : 'Empty Response'}". This might be due to a complex or unusual draft, or an internal issue with the request. Please simplify your draft or try again.`;
  } catch (error) {
    console.error("Error generating drafting guidance:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("SAFETY") || errorMsg.toLowerCase().includes("blocked") || errorMsg.toLowerCase().includes("policy")) {
      return `Error: Feedback generation for '${task.type}' was blocked due to safety or content policy. Please review your draft for any sensitive content or try a different approach. (Details: ${errorMsg})`;
    }
    return `Error: An internal error occurred while generating drafting guidance for '${task.type}': ${errorMsg}. Please try again. If the issue persists, the AI might be temporarily unavailable.`;
  }
};

export const getFilingProcedureInfo = async (
  draftType: string,
  relevantLaws: string[] | string,
  practiceMode: PracticeMode
): Promise<string> => {
  if (!ai) return "Error: AI client not initialized. Cannot provide filing info.";

  const relevantLawsText = Array.isArray(relevantLaws) ? relevantLaws.join(', ') : relevantLaws;

  const systemInstruction = `
  **AI Role:** You are a Legal Procedural Guide specializing in ${practiceMode} law. Your goal is to provide clear, educational overviews of common legal procedures.
  **Task Definition:** Explain the typical filing procedure for a specified legal document ('${draftType}') within the ${practiceMode} legal system.
  **Context (Inputs Provided to You):**
    - Document Type: '${draftType}'
    - Relevant Legal Framework for this Document: ${relevantLawsText}
    - Practice Mode: ${practiceMode} Law
    - Application Aesthetic: The app has a professional, premium Oxford Navy & Gold glassmorphic theme with sleek typography and subtle gold accents.
  **Information to Include in Your Explanation (Typical Steps):**
    1.  **Likely Court/Forum/Authority:** Identify where such a document is commonly filed (e.g., specific type of court - like District Court, High Court; tribunal; government office). Be as specific as appropriate for a general overview.
    2.  **Key Procedural Steps (General Sequence):** Outline the common sequence of actions. Examples:
        - **Drafting & Finalization:** Ensure the document is complete, signed, and verified/affirmed as required.
        - **Accompanying Documents:** (List critical ones - see point 3).
        - **Court Fees/Stamp Duty:** Explain that appropriate fees must be paid (mention common methods like e-stamping, treasury challan, or online payment if applicable in ${practiceMode}).
        - **Filing Method:** Describe how it's typically filed (e.g., e-filing portal if prevalent for that court/document type in ${practiceMode}, physical filing at a court registry/counter).
        - **Scrutiny & Registration:** Mention that court staff will scrutinize the documents for defects. If defect-free, it's registered and assigned a number.
        - **Service on Opposite Party:** Briefly explain that copies must usually be formally served on the opposing parties/respondents through approved methods.
    3.  **Common Accompanying Documents:** List 3-5 critical documents that are usually filed alongside the main '${draftType}' (e.g., Vakalatnama/Power of Attorney, supporting affidavits, list of documents/annexures, memo of parties, copies of key evidence). Be specific if certain accompaniments are almost always required for this '${draftType}' in ${practiceMode}.
    4.  **Brief Beginner Considerations/Tips:** Mention 1-2 common pitfalls learners should be aware of, or important tips for a smooth filing process (e.g., "Ensure all annexures are properly paginated and marked," or "Check the specific court's latest practice directions for e-filing requirements," or "Always retain proof of filing and service.").
  **Output Guidelines:**
    - Present information in a clear, step-by-step, or well-organized bulleted list. Use bold for headings or key terms.
    - Use language that is practical and easy for a law student or junior practitioner to understand.
    - Explicitly state: "**Disclaimer:** This information is for general educational purposes only and does not constitute legal advice for any specific case. Procedures can vary based on specific court rules and case details. Always consult relevant statutes, rules, and legal counsel for specific matters." (This disclaimer must be included).
    - Focus on procedures relevant to ${relevantLawsText} and the ${practiceMode} context.
  **Error Handling Protocol:**
    - If the requested '${draftType}' has an extremely varied filing procedure depending on minute factual contexts not provided, or if it's too obscure for a general explanation, return a message like: "Error: Filing information for '${draftType}' is highly context-dependent and cannot be summarized generally. Please consult specific procedural codes or legal counsel."
  `;

  const prompt = `Please explain the general filing procedure for a ${draftType} in ${practiceMode} law, considering the relevant laws: ${relevantLawsText}. Include the mandatory disclaimer.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    const textResponse = response.text;
    if (textResponse && textResponse.trim() !== "" && !textResponse.trim().toLowerCase().startsWith("error:")) {
      return textResponse.trim();
    }
    return `Error: AI returned an empty or error-like response for filing information on '${draftType}': "${textResponse ? textResponse.trim() : 'Empty Response'}". This could be due to the specificity of the document type.`;
  } catch (error) {
    console.error("Error getting filing procedure information:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("SAFETY") || errorMsg.toLowerCase().includes("blocked") || errorMsg.toLowerCase().includes("policy")) {
      return `Error: Filing information generation for '${draftType}' was blocked due to safety or content policy. (Details: ${errorMsg})`;
    }
    return `Error: An internal error occurred while fetching filing procedure information for '${draftType}': ${errorMsg}. Please try again.`;
  }
};
