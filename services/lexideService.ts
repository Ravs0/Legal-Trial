import type { LexIDESection, LexIDEResearchResult } from "../types";
import { searchWeb } from "./searchService";
import { callApi } from "./aiService";

class LexServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LexServiceError';
  }
}

export const performLegalResearch = async (query: string): Promise<LexIDEResearchResult[]> => {
  try {
    const results = await searchWeb(query);
    return results.map((r, index) => ({
      id: `res-${Date.now()}-${index}`,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }));
  } catch {
    return [];
  }
};

export const summarizeSource = async (title: string, snippet: string, url: string): Promise<string> => {
  try {
    const text = await callApi(
      [{ role: 'user', content: `Summarize this legal resource in 3 concise bullet points for a research paper.\n\nTitle: ${title}\nURL: ${url}\n\n${snippet}` }],
      'You are a legal research assistant. Provide concise bullet-point summaries of legal sources.'
    );
    return text || "Summary unavailable.";
  } catch {
    return "Error generating summary.";
  }
};

export const analyzeLegalConsistency = async (currentSection: LexIDESection, allSections: LexIDESection[]): Promise<string> => {
  try {
    const fullContext = allSections.map(s => `[Section: ${s.title}]\n${s.content}`).join('\n\n');
    return await callApi(
      [{ role: 'user', content: `Analyze the "TARGET SECTION" within the context of the "FULL PAPER".

FULL PAPER:
${fullContext}

TARGET SECTION TO ANALYZE:
${currentSection.content}

CHECKS:
1. STYLE: Does the target section match the tone of the rest of the paper?
2. REDUNDANCY: Are there arguments or facts in the target section already covered in other sections?
3. FLOW: Is the transition into this section logical?
4. STANDARDS: Does it follow professional legal drafting standards?

Provide a detailed bulleted analysis and specific improvement suggestions.` }],
      'You are a senior legal editor. Analyze legal documents for consistency, redundancy, and drafting quality.'
    );
  } catch {
    return "Analysis service temporarily unavailable.";
  }
};

export const refineLegalWithIntent = async (text: string, intent: string, context: string): Promise<string> => {
  try {
    const result = await callApi(
      [{ role: 'user', content: `REFINE LEGAL TEXT.

USER INTENT: ${intent}
FULL PAPER CONTEXT (SUMMARY): ${context.substring(0, 2000)}...

ORIGINAL TEXT:
${text}

INSTRUCTIONS:
1. Apply the user's intent to the text.
2. Ensure stylistic consistency with the rest of the paper.
3. Eliminate redundant phrases or repetitive content found across the document.
4. DO NOT change legal citations or formal names.
5. Return ONLY the refined legal text.` }],
      'You are a senior legal editor. Refine legal text based on user intent while preserving citations and formal names.'
    );
    return result || text;
  } catch {
    return text;
  }
};

export const parseLegalPaper = async (rawText: string): Promise<{ sections: { title: string; content: string }[] }> => {
  if (!rawText.trim()) throw new LexServiceError("No text to parse.");

  try {
    const text = await callApi(
      [{ role: 'user', content: `Split the following legal text into logical sections based on major headings.

RULES:
1. DO NOT SUMMARIZE.
2. DO NOT OMIT ANY TEXT. Every character must be preserved.
3. Output a JSON array of objects with 'title' and 'content'.

Text to process:
${rawText}` }],
      'You are a high-precision document parser. Split legal documents into sections by headings. Return ONLY valid JSON. No commentary, no markdown formatting.',
      { temperature: 0.1, max_tokens: 4096 }
    );

    // Strip any markdown fence or wrapping commentary
    let cleaned = text.trim();
    // Remove markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, '').replace(/```\s*$/gm, '').trim();
    // Find the first [ and last ] for a JSON array
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1) {
      cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
    }
    // Find the first { and last } if it's an object with sections property
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      cleaned = cleaned.slice(objStart, objEnd + 1);
    }

    const parsed = JSON.parse(cleaned);
    // Handle both { sections: [...] } and direct array
    const sections = parsed.sections || parsed;
    if (!Array.isArray(sections)) throw new Error("Parsed result is not an array");
    return { sections };
  } catch (err) {
    throw new LexServiceError(`AI parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
};
