import { GoogleGenAI, Type } from "@google/genai";
import type { LexIDESection, LexIDEResearchResult } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const performLegalResearch = async (query: string): Promise<LexIDEResearchResult[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Perform high-quality legal research on: "${query}". Provide a list of key precedents, statutes, and academic perspectives. Ensure citations are accurate.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const text = response.text || "";

    return groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any, index: number) => ({
        id: `res-${Date.now()}-${index}`,
        title: chunk.web?.title || "Legal Source",
        url: chunk.web?.uri || "#",
        snippet: text.slice(0, 300) + "...",
      }));
  } catch {
    return [];
  }
};

export const summarizeSource = async (title: string, snippet: string, url: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Summarize this legal resource in 3 concise bullet points for a research paper. Title: ${title}. URL: ${url}. Snippet: ${snippet}`,
    });
    return response.text || "Summary unavailable.";
  } catch {
    return "Error generating summary.";
  }
};

export const analyzeLegalConsistency = async (currentSection: LexIDESection, allSections: LexIDESection[]): Promise<string> => {
  try {
    const fullContext = allSections.map(s => `[Section: ${s.title}]\n${s.content}`).join('\n\n');
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `ACT AS A SENIOR LEGAL EDITOR.
      Analyze the "TARGET SECTION" within the context of the "FULL PAPER".

      CHECKS:
      1. STYLE: Does the target section match the tone of the rest of the paper?
      2. REDUNDANCY: Are there arguments or facts in the target section already covered in other sections?
      3. FLOW: Is the transition into this section logical?
      4. STANDARDS: Does it follow professional legal drafting standards?

      FULL PAPER:
      ${fullContext}

      TARGET SECTION TO ANALYZE:
      ${currentSection.content}

      Provide a detailed bulleted analysis and specific improvement suggestions.`,
    });
    return response.text || "No specific issues identified.";
  } catch {
    return "Analysis service temporarily unavailable.";
  }
};

export const refineLegalWithIntent = async (text: string, intent: string, context: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `REFINE LEGAL TEXT.

      USER INTENT: ${intent}
      FULL PAPER CONTEXT (SUMMARY): ${context.substring(0, 2000)}...

      ORIGINAL TEXT:
      ${text}

      INSTRUCTIONS:
      1. Apply the user's intent to the text.
      2. Ensure stylistic consistency with the rest of the paper.
      3. Eliminate redundant phrases or repetitive content found across the document.
      4. DO NOT change legal citations or formal names.
      5. Return ONLY the refined legal text.`,
    });
    return response.text || text;
  } catch {
    return text;
  }
};

export const parseLegalPaper = async (rawText: string): Promise<{ sections: { title: string; content: string }[] }> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `ACT AS A HIGH-PRECISION DOCUMENT PARSER.
      Split the text into logical sections based on major headings.

      RULES:
      1. DO NOT SUMMARIZE.
      2. DO NOT OMIT ANY TEXT. Every character must be preserved.
      3. Output a JSON array of objects with 'title' and 'content'.

      Text to process:
      ${rawText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["title", "content"]
              }
            }
          },
          required: ["sections"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch {
    throw new Error("AI parsing failed");
  }
};
