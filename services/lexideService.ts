import type { LexIDESection, LexIDEResearchResult } from "../types";
import { searchWeb } from "./searchService";
import { callApi } from "./aiService";

const MAX_RESEARCH_QUERY = 500;
const MIN_RESEARCH_QUERY = 2;
const MAX_SECTION_TITLE = 200;
const MAX_SUMMARY_SNIPPET = 2000;
const MAX_REFINE_TEXT = 20000;
const MAX_PAPER_CHARS = 120000;

export class LexServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LexServiceError';
  }
}

export interface LegalResearchOutcome {
  results: LexIDEResearchResult[];
  /** True when the search path ran successfully (even if zero hits). */
  available: boolean;
  /** Empty-state or error copy for the UI. */
  message?: string;
}

function asCleanString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function sanitizeUrl(raw: unknown): string {
  const url = asCleanString(raw, 2000);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

function normalizeResearchResults(
  results: { title?: string; url?: string; snippet?: string }[],
): LexIDEResearchResult[] {
  const stamp = Date.now();
  return results
    .map((r, index) => {
      const title = asCleanString(r.title, 400);
      const url = sanitizeUrl(r.url);
      const snippet = asCleanString(r.snippet, 800);
      if (!title && !url && !snippet) return null;
      return {
        id: `res-${stamp}-${index}`,
        title: title || 'Untitled source',
        url,
        snippet,
      } satisfies LexIDEResearchResult;
    })
    .filter((r): r is LexIDEResearchResult => r !== null);
}

/**
 * Prefer a JSON array when the model returns one; otherwise accept
 * `{ sections: [...] }`. Avoids the old bug where an object wrapper after
 * an array slice would clobber a valid array parse.
 */
export function extractJsonPayload(text: string): unknown {
  let cleaned = (text || '').trim();
  if (!cleaned) throw new Error('Empty model response');

  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();

  const arrayStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');

  // Prefer array when it appears first (or alone).
  if (arrayStart !== -1 && (objStart === -1 || arrayStart < objStart)) {
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }
  }

  if (objStart !== -1) {
    const objEnd = cleaned.lastIndexOf('}');
    if (objEnd > objStart) {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    }
  }

  return JSON.parse(cleaned);
}

export function normalizeParsedSections(raw: unknown): { title: string; content: string }[] {
  let list: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    list = obj.sections ?? obj.data ?? obj.result;
  }
  if (!Array.isArray(list)) {
    throw new Error('Parsed result is not an array of sections');
  }

  const sections = list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const title = asCleanString(row.title, MAX_SECTION_TITLE) || 'Untitled Section';
      const content =
        typeof row.content === 'string'
          ? row.content
          : typeof row.body === 'string'
            ? row.body
            : typeof row.text === 'string'
              ? row.text
              : '';
      if (!content.trim()) return null;
      return { title, content };
    })
    .filter((s): s is { title: string; content: string } => s !== null);

  if (sections.length === 0) {
    throw new Error('No sections with content were parsed from the document');
  }
  return sections;
}

export const performLegalResearch = async (query: string): Promise<LegalResearchOutcome> => {
  const trimmed = (query || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { results: [], available: false, message: 'Enter a research query.' };
  }
  if (trimmed.length < MIN_RESEARCH_QUERY) {
    return {
      results: [],
      available: false,
      message: `Query is too short (min ${MIN_RESEARCH_QUERY} characters).`,
    };
  }
  if (trimmed.length > MAX_RESEARCH_QUERY) {
    return {
      results: [],
      available: false,
      message: `Query is too long (max ${MAX_RESEARCH_QUERY} characters).`,
    };
  }

  try {
    const results = await searchWeb(trimmed);
    const normalized = normalizeResearchResults(Array.isArray(results) ? results : []);
    if (normalized.length === 0) {
      return {
        results: [],
        available: true,
        message: 'No sources matched this query. Try a case name, statute, or narrower issue.',
      };
    }
    return { results: normalized, available: true };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Research search failed. Check network or search API configuration.';
    return { results: [], available: false, message };
  }
};

export const summarizeSource = async (
  title: string,
  snippet: string,
  url: string,
): Promise<string> => {
  const cleanTitle = asCleanString(title, 400);
  const cleanSnippet = asCleanString(snippet, MAX_SUMMARY_SNIPPET);
  const cleanUrl = sanitizeUrl(url);

  if (!cleanTitle && !cleanSnippet) {
    return 'Nothing to summarize — source title and snippet are empty.';
  }

  try {
    const text = await callApi(
      [{
        role: 'user',
        content:
          `Summarize this legal resource in 3 concise bullet points for a research paper.\n\n` +
          `Title: ${cleanTitle || 'Untitled'}\nURL: ${cleanUrl || 'n/a'}\n\n${cleanSnippet || '(no snippet)'}`,
      }],
      'You are a legal research assistant. Provide concise bullet-point summaries of legal sources.',
    );
    const out = (text || '').trim();
    return out || 'Summary unavailable.';
  } catch {
    return 'Error generating summary. Try again or open the original source.';
  }
};

export const analyzeLegalConsistency = async (
  currentSection: LexIDESection,
  allSections: LexIDESection[],
): Promise<string> => {
  if (!currentSection || typeof currentSection.content !== 'string') {
    return 'No target section content available for analysis.';
  }
  if (!currentSection.content.trim()) {
    return 'Target section is empty — add draft text before running consistency analysis.';
  }

  const sections = Array.isArray(allSections) ? allSections : [];
  try {
    const fullContext = sections
      .filter((s) => s && typeof s.title === 'string' && typeof s.content === 'string')
      .map((s) => `[Section: ${s.title}]\n${s.content}`)
      .join('\n\n')
      .slice(0, MAX_PAPER_CHARS);

    const result = await callApi(
      [{
        role: 'user',
        content: `Analyze the "TARGET SECTION" within the context of the "FULL PAPER".

FULL PAPER:
${fullContext || '(no other sections)'}

TARGET SECTION TO ANALYZE:
${currentSection.content.slice(0, MAX_REFINE_TEXT)}

CHECKS:
1. STYLE: Does the target section match the tone of the rest of the paper?
2. REDUNDANCY: Are there arguments or facts in the target section already covered in other sections?
3. FLOW: Is the transition into this section logical?
4. STANDARDS: Does it follow professional legal drafting standards?

Provide a detailed bulleted analysis and specific improvement suggestions.`,
      }],
      'You are a senior legal editor. Analyze legal documents for consistency, redundancy, and drafting quality.',
    );
    return (result || '').trim() || 'Analysis returned empty. Try again.';
  } catch {
    return 'Analysis service temporarily unavailable. Check AI configuration and retry.';
  }
};

export const refineLegalWithIntent = async (
  text: string,
  intent: string,
  context: string,
): Promise<string> => {
  const original = typeof text === 'string' ? text : '';
  const userIntent = (intent || '').trim();
  if (!original.trim()) return original;
  if (!userIntent) return original;

  try {
    const result = await callApi(
      [{
        role: 'user',
        content: `REFINE LEGAL TEXT.

USER INTENT: ${userIntent.slice(0, 1000)}
FULL PAPER CONTEXT (SUMMARY): ${(context || '').slice(0, 2000)}

ORIGINAL TEXT:
${original.slice(0, MAX_REFINE_TEXT)}

INSTRUCTIONS:
1. Apply the user's intent to the text.
2. Ensure stylistic consistency with the rest of the paper.
3. Eliminate redundant phrases or repetitive content found across the document.
4. DO NOT change legal citations or formal names.
5. Return ONLY the refined legal text.`,
      }],
      'You are a senior legal editor. Refine legal text based on user intent while preserving citations and formal names.',
    );
    const out = (result || '').trim();
    return out || original;
  } catch {
    return original;
  }
};

export const parseLegalPaper = async (
  rawText: string,
): Promise<{ sections: { title: string; content: string }[] }> => {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new LexServiceError('No text to parse. Paste a draft before running Smart Split.');
  }
  if (rawText.length > MAX_PAPER_CHARS) {
    throw new LexServiceError(
      `Document is too large to parse in one pass (max ${MAX_PAPER_CHARS.toLocaleString()} characters). Split it manually first.`,
    );
  }

  try {
    const text = await callApi(
      [{
        role: 'user',
        content: `Split the following legal text into logical sections based on major headings.

RULES:
1. DO NOT SUMMARIZE.
2. DO NOT OMIT ANY TEXT. Every character must be preserved.
3. Output a JSON array of objects with 'title' and 'content'.

Text to process:
${rawText}`,
      }],
      'You are a high-precision document parser. Split legal documents into sections by headings. Return ONLY valid JSON. No commentary, no markdown formatting.',
      { temperature: 0.1, max_tokens: 4096 },
    );

    if (!text || !String(text).trim()) {
      throw new Error('Model returned an empty response');
    }

    const parsed = extractJsonPayload(String(text));
    const sections = normalizeParsedSections(parsed);
    return { sections };
  } catch (err) {
    if (err instanceof LexServiceError) throw err;
    throw new LexServiceError(
      `AI parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }
};
