import { APP_NAME } from '../constants';
import type { AnalysisMetricsSource, ChatMessage, SessionRecord } from '../types';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
} from 'docx';

/** How coaching metrics were produced for a completed session (extends AnalysisMetricsSource). */
export type AnalysisSourceKind = AnalysisMetricsSource | 'unavailable' | 'pending' | 'unknown';

const LOCAL_COACHING_PREFIX = /^local coaching summary/i;

const sanitizeFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'lexforge-session';

const formatDate = (value: Date | string | undefined) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
};

const safeTitle = (record: SessionRecord): string => {
  const title = record?.settings?.caseDetail?.title;
  return typeof title === 'string' && title.trim() ? title : 'Untitled case';
};

const safeName = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value : fallback;

const formatScoreField = (value: unknown): string => {
  if (value == null) return 'N/A';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};

const cleanAreas = (areas: unknown): string[] => {
  if (!Array.isArray(areas)) return [];
  return areas
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());
};

const titleCaseToken = (value: string): string =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** Human-readable practice mode for exports. */
export const formatPracticeMode = (mode: unknown): string => {
  if (typeof mode !== 'string' || !mode.trim()) return 'Unknown';
  const key = mode.trim().toLowerCase();
  if (key === 'indian') return 'Indian';
  if (key === 'international') return 'International';
  return titleCaseToken(mode.trim());
};

/** Human-readable session type / difficulty enums. */
export const formatEnumLabel = (value: unknown, fallback = 'Unknown'): string => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((part) => titleCaseToken(part.toLowerCase()))
    .join(' ');
};

const formatDuration = (record: SessionRecord): string => {
  if (typeof record?.durationMinutes === 'number' && Number.isFinite(record.durationMinutes)) {
    const m = Math.max(0, Math.round(record.durationMinutes));
    return m === 1 ? '1 minute' : `${m} minutes`;
  }
  if (typeof record?.elapsedSeconds === 'number' && Number.isFinite(record.elapsedSeconds)) {
    const secs = Math.max(0, Math.round(record.elapsedSeconds));
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s ? `${m}m ${s}s` : `${m} minutes`;
  }
  return '';
};

/**
 * Infer whether metrics came from AI analysis or the local coaching fallback.
 * Prefers an explicit `analysisStatus.source` when present; otherwise inspects
 * the local-coaching feedback prefix written by `buildLocalPerformanceMetrics`.
 */
export const detectAnalysisSource = (record: SessionRecord | null | undefined): AnalysisSourceKind => {
  if (!record) return 'unknown';
  const status = record.analysisStatus;
  const explicit = status?.source;
  if (explicit === 'ai' || explicit === 'local') return explicit;

  const state = status?.state;
  if (state === 'unavailable') return 'unavailable';
  if (state === 'pending') return 'pending';

  const metrics = record.performance;
  if (!metrics) {
    if (state === 'idle' || state == null) return 'unknown';
    return 'unavailable';
  }

  const feedback = typeof metrics.feedback === 'string' ? metrics.feedback.trim() : '';
  if (feedback && LOCAL_COACHING_PREFIX.test(feedback)) return 'local';
  if (state === 'ready' || state == null) return 'ai';
  return 'ai';
};

export const analysisSourceLabel = (source: AnalysisSourceKind): string => {
  switch (source) {
    case 'ai':
      return 'AI coaching analysis';
    case 'local':
      return 'Local coaching fallback (not AI)';
    case 'unavailable':
      return 'Unavailable';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
};

const parseObjectionFromText = (
  text: string,
): { grounds?: string; basis?: string; quick?: boolean } => {
  const trimmed = text.trim();
  if (!/^\[OBJECTION\]/i.test(trimmed)) return {};
  const body = trimmed.replace(/^\[OBJECTION\]\s*/i, '');
  const groundsMatch = body.match(/^Grounds:\s*([^\n]+)/i);
  const basisMatch = body.match(/Basis:\s*([\s\S]+)/i);
  const grounds = groundsMatch?.[1]?.replace(/\(Quick Objection Reflex\)/i, '').trim();
  let basis = basisMatch?.[1]?.trim() ?? '';
  const quick = /\(Quick Objection Reflex\)/i.test(body);
  basis = basis.replace(/\s*\(Quick Objection Reflex\)\s*$/i, '').trim();
  // Alternate form: `[OBJECTION] relevance: explanation`
  if (!groundsMatch) {
    const colon = body.indexOf(':');
    if (colon > 0) {
      return {
        grounds: body.slice(0, colon).trim(),
        basis: body.slice(colon + 1).replace(/\s*\(Quick Objection Reflex\)\s*$/i, '').trim(),
        quick,
      };
    }
    return { grounds: body.trim(), quick };
  }
  return { grounds, basis: basis || undefined, quick };
};

/**
 * Format a single transcript line body (without speaker heading).
 * Pretty-prints objections and labels rulings when metadata is present.
 */
export const formatTranscriptBody = (message: ChatMessage | null | undefined): string => {
  if (!message) return '';
  const text = typeof message.text === 'string' ? message.text : '';
  const meta = message.meta;
  const kind = meta?.kind;

  const isObjection =
    kind === 'objection' ||
    Boolean(meta?.objection) ||
    (typeof text === 'string' && /^\[OBJECTION\]/i.test(text.trim()));

  if (isObjection) {
    const fromMeta = meta?.objection;
    const fromText = parseObjectionFromText(text);
    const grounds = safeName(fromMeta?.grounds ?? fromText.grounds, 'Not stated');
    const basisRaw = fromMeta?.basis ?? fromText.basis ?? '';
    const basis =
      typeof basisRaw === 'string' && basisRaw.trim()
        ? basisRaw.trim()
        : 'No written basis recorded.';
    const outcome = fromMeta?.outcome
      ? titleCaseToken(fromMeta.outcome)
      : '';
    const quick =
      fromMeta?.wasQuick || fromText.quick ? ' · quick reflex' : '';
    const outcomeLine = outcome ? `\n- Outcome: ${outcome}` : '';
    return `**Objection**${quick}\n- Grounds: ${grounds}\n- Basis: ${basis}${outcomeLine}`;
  }

  if (kind === 'ruling') {
    const body = text.trim() || '_No ruling text recorded._';
    return `**Ruling**\n\n${body}`;
  }

  if (kind === 'instruction' || kind === 'system' || message.sender === 'system') {
    const body = text.trim();
    if (!body) return '';
    return `_${body}_`;
  }

  return text.trim();
};

const formatTranscriptSpeaker = (
  message: ChatMessage,
  record: SessionRecord,
): string => {
  const settings = record?.settings;
  if (message?.sender === 'user') {
    return message?.meta?.kind === 'objection' ? 'You (objection)' : 'You';
  }
  if (message?.sender === 'judge') {
    const name = safeName(settings?.judgePersonality?.name, 'Judge');
    return message?.meta?.kind === 'ruling' ? `${name} (ruling)` : name;
  }
  if (message?.sender === 'opposingCounsel') {
    return safeName(settings?.opposingCounselPersonality?.name, 'Opposing counsel');
  }
  return 'System';
};

export const buildScorecardMarkdown = (record: SessionRecord) => {
  const metrics = record?.performance;
  const settings = record?.settings;
  const live = record?.scoreBreakdown;
  const analysisState = record?.analysisStatus?.state;
  const source = detectAnalysisSource(record);
  const sourceLine = analysisSourceLabel(source);

  const scoreLine = metrics
    ? `**${formatScoreField(metrics.overallScore)}/10** overall (analysis scale 0–10)`
    : live && typeof live.total === 'number' && Number.isFinite(live.total)
      ? `Live courtroom structure **${formatScoreField(live.total)}/200** (analysis scores not attached)`
      : 'Live courtroom score unavailable';

  const hasLive =
    live &&
    typeof live === 'object' &&
    (typeof live.total === 'number' ||
      typeof live.engagement === 'number' ||
      typeof live.advocacy === 'number');

  const liveSection = hasLive
    ? `## Live courtroom structure (0–200)

- Total: ${formatScoreField(live!.total)}/200
- Engagement: ${formatScoreField(live!.engagement)}
- Advocacy: ${formatScoreField(live!.advocacy)}
- Objections: ${formatScoreField(live!.objections)}
- Responsiveness: ${formatScoreField(live!.responsiveness)}
- Professionalism: ${formatScoreField(live!.professionalism)}

_Note: Live structure scores advocacy activity during the hearing. Analysis scores below use a separate 0–10 coaching scale._
`
    : `## Live courtroom structure (0–200)

- Live courtroom score unavailable
`;

  const statusBits: string[] = [];
  if (analysisState) {
    statusBits.push(
      `Analysis status: ${analysisState}${
        record?.analysisStatus?.error ? ` (${record.analysisStatus.error})` : ''
      }`,
    );
  }
  statusBits.push(`Analysis source: ${sourceLine}`);

  const duration = formatDuration(record);
  const phase =
    typeof record?.activePhase === 'string' && record.activePhase.trim()
      ? formatEnumLabel(record.activePhase)
      : '';
  const sessionType =
    settings?.sessionType != null ? formatEnumLabel(settings.sessionType, '') : '';
  const difficulty =
    settings?.difficulty != null ? formatEnumLabel(settings.difficulty, '') : '';

  const areas = cleanAreas(metrics?.improvementAreas);
  const improvementAreas = areas.length
    ? areas.map((area) => `- ${area}`).join('\n')
    : '- No improvement areas were generated for this session.';

  const feedback =
    typeof metrics?.feedback === 'string' && metrics.feedback.trim()
      ? metrics.feedback.trim()
      : 'Performance analysis was not available, but the transcript remains exportable.';

  const analysisScoresSection = metrics
    ? `## Analysis scores (0–10)

- Argument strength: ${formatScoreField(metrics.argumentStrength)}
- Precedent usage: ${formatScoreField(metrics.precedentUsage)}
- Legal grounding: ${formatScoreField(metrics.legalGrounding)}
- Response quality: ${formatScoreField(metrics.responseQuality)}
- Objection handling: ${formatScoreField(metrics.objectionHandling)}
- Courtroom presence: ${formatScoreField(metrics.courtroomPresence)}
`
    : `## Analysis scores (0–10)

- Argument strength: N/A
- Precedent usage: N/A
- Legal grounding: N/A
- Response quality: N/A
- Objection handling: N/A
- Courtroom presence: N/A
`;

  return `# ${APP_NAME} Scorecard

${scoreLine}

## Session

- Mode: ${formatPracticeMode(settings?.practiceMode)}
${sessionType ? `- Session type: ${sessionType}\n` : ''}${
    difficulty ? `- Difficulty: ${difficulty}\n` : ''
  }- Case: ${safeTitle(record)}
- Judge: ${safeName(settings?.judgePersonality?.name, 'Unknown judge')}
- Opposing counsel: ${safeName(settings?.opposingCounselPersonality?.name, 'Unknown counsel')}
${phase ? `- Last phase: ${phase}\n` : ''}${
    duration ? `- Duration: ${duration}\n` : ''
  }- Started: ${formatDate(record?.startTime)}
- Ended: ${formatDate(record?.endTime)}
${statusBits.map((bit) => `- ${bit}`).join('\n')}

${liveSection}
${analysisScoresSection}
## Feedback

${feedback}

## Improvement Areas

${improvementAreas}
`;
};

export const buildTranscriptMarkdown = (record: SessionRecord) => {
  const transcript = Array.isArray(record?.transcript) ? record.transcript : [];
  const lines = transcript
    .map((message) => {
      if (!message || typeof message !== 'object') return '';
      const body = formatTranscriptBody(message as ChatMessage);
      if (!body) return '';
      const speaker = formatTranscriptSpeaker(message as ChatMessage, record);
      const phase =
        typeof message.meta?.phase === 'string' && message.meta.phase.trim()
          ? ` · ${formatEnumLabel(message.meta.phase)}`
          : '';
      const when = formatDate(message.timestamp);
      return `### ${speaker} (${when}${phase})\n\n${body}`;
    })
    .filter(Boolean);

  const spoken = transcript.filter((m) => {
    const t = typeof m?.text === 'string' ? m.text.trim() : '';
    return t.length > 0;
  }).length;

  const footer =
    lines.length > 0
      ? `\n\n---\n\n_${spoken} message${spoken === 1 ? '' : 's'} exported from ${APP_NAME}._`
      : '';

  return `# ${APP_NAME} Transcript

Case: ${safeTitle(record)}
Mode: ${formatPracticeMode(record?.settings?.practiceMode)}
Judge: ${safeName(record?.settings?.judgePersonality?.name, 'Unknown judge')}
Opposing counsel: ${safeName(record?.settings?.opposingCounselPersonality?.name, 'Unknown counsel')}

${lines.length ? lines.join('\n\n') : '_No transcript lines were recorded for this session._'}${footer}
`;
};

export const downloadMarkdown = (filename: string, contents: string) => {
  if (typeof document === 'undefined') {
    console.warn('[exportService] downloadMarkdown requires a browser document');
    return false;
  }
  try {
    const safeName = sanitizeFilename(filename.replace(/\.md$/i, '')) + '.md';
    const blob = new Blob([contents ?? ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Delay revoke so the browser can start the download.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    }, 0);
    return true;
  } catch (error) {
    console.warn('[exportService] download failed', error);
    return false;
  }
};

export const scorecardFilename = (record: SessionRecord) => {
  const base = sanitizeFilename(safeTitle(record));
  const suffix =
    typeof record?.id === 'string' && record.id
      ? `-${sanitizeFilename(record.id).slice(0, 24)}`
      : '';
  return `${base}${suffix}-scorecard.md`;
};

export const transcriptFilename = (record: SessionRecord) => {
  const base = sanitizeFilename(safeTitle(record));
  const suffix =
    typeof record?.id === 'string' && record.id
      ? `-${sanitizeFilename(record.id).slice(0, 24)}`
      : '';
  return `${base}${suffix}-transcript.md`;
};

// ── Drafting Studio export ───────────────────────────────────────────────────

export interface DraftExportInput {
  title?: string;
  documentType?: string;
  practiceMode?: string;
  objective?: string;
  facts?: string;
  draft?: string;
  feedback?: string;
  /** Optional free-form notes (e.g. scoring summary). */
  notes?: string;
}

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

export const buildDraftMarkdown = (input: DraftExportInput = {}) => {
  const title =
    typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled draft';
  const documentType =
    typeof input.documentType === 'string' && input.documentType.trim()
      ? input.documentType.trim()
      : 'Unknown';
  const practiceMode = formatPracticeMode(
    typeof input.practiceMode === 'string' ? input.practiceMode : '',
  );
  const objective =
    typeof input.objective === 'string' && input.objective.trim()
      ? input.objective.trim()
      : 'Not specified';
  const facts =
    typeof input.facts === 'string' && input.facts.trim()
      ? input.facts.trim()
      : 'Scenario facts were not generated.';
  const draftBody =
    typeof input.draft === 'string' && input.draft.trim() ? input.draft.trim() : '_Empty draft_';
  const wordCount =
    typeof input.draft === 'string' && input.draft.trim() ? countWords(input.draft) : 0;
  const feedbackBlock =
    typeof input.feedback === 'string' && input.feedback.trim()
      ? `\n## Feedback\n\n${input.feedback.trim()}\n`
      : '';
  const notesBlock =
    typeof input.notes === 'string' && input.notes.trim()
      ? `\n## Notes\n\n${input.notes.trim()}\n`
      : '';

  return `# ${APP_NAME} Draft

## Meta

- Title: ${title}
- Type: ${documentType}
- Mode: ${practiceMode}
- Objective: ${objective}
${wordCount > 0 ? `- Word count: ${wordCount}\n` : ''}
## Facts

${facts}

## Draft

${draftBody}
${feedbackBlock}${notesBlock}`;
};

export const draftFilename = (title: string) => {
  const base = sanitizeFilename(typeof title === 'string' ? title : '');
  return `${base || 'untitled-draft'}-draft.md`;
};

// ── Drafting Studio DOCX export ──────────────────────────────────────────────

type DraftLineKind = 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'body';

interface ClassifiedDraftLine {
  kind: DraftLineKind;
  text: string;
}

const NUMBERED_LINE_RE = /^\d{1,3}[.)]\s+/;

const HEADING_BY_KIND = {
  heading1: HeadingLevel.HEADING_1,
  heading2: HeadingLevel.HEADING_2,
  heading3: HeadingLevel.HEADING_3,
} as const;

const DRAFT_NUMBERING_REFERENCE = 'lexforge-draft-numbered';

/** Map one plain-text line to a deterministic docx paragraph kind. */
const classifyDraftLine = (raw: string): ClassifiedDraftLine | null => {
  const line = raw.replace(/\s+$/, '');
  if (!line.trim()) return null;
  if (line.startsWith('### ')) return { kind: 'heading3', text: line.slice(4).trim() };
  if (line.startsWith('## ')) return { kind: 'heading2', text: line.slice(3).trim() };
  if (line.startsWith('# ')) return { kind: 'heading1', text: line.slice(2).trim() };
  if (line.startsWith('- ') || line.startsWith('* ')) return { kind: 'bullet', text: line.slice(2).trim() };
  const numbered = line.match(NUMBERED_LINE_RE);
  if (numbered) return { kind: 'numbered', text: line.slice(numbered[0].length).trim() };
  return { kind: 'body', text: line.trim() };
};

const toDocxParagraph = (line: ClassifiedDraftLine): Paragraph => {
  switch (line.kind) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return new Paragraph({ text: line.text, heading: HEADING_BY_KIND[line.kind] });
    case 'bullet':
      return new Paragraph({ text: line.text, bullet: { level: 0 } });
    case 'numbered':
      return new Paragraph({
        text: line.text,
        numbering: { reference: DRAFT_NUMBERING_REFERENCE, level: 0 },
      });
    default:
      return new Paragraph({ text: line.text });
  }
};

/** Convert plain drafted text into a .docx Blob (headings, bullets, numbered items, body). */
export const buildDraftDocxBlob = async (text: string): Promise<Blob> => {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map(classifyDraftLine)
    .filter((line): line is ClassifiedDraftLine => line !== null);
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: DRAFT_NUMBERING_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ properties: {}, children: lines.map(toDocxParagraph) }],
  });
  return Packer.toBlob(doc);
};

export const draftDocxFilename = (title: string) => {
  const base = sanitizeFilename(typeof title === 'string' ? title : '');
  return `${base || 'untitled-draft'}.docx`;
};

/** Download pre-built docx bytes through the same anchor flow as downloadMarkdown. */
export const downloadDocx = (filename: string, blob: Blob): boolean => {
  if (typeof document === 'undefined') {
    console.warn('[exportService] downloadDocx requires a browser document');
    return false;
  }
  try {
    const safeName = sanitizeFilename(filename.replace(/\.docx$/i, '')) + '.docx';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Delay revoke so the browser can start the download.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    }, 0);
    return true;
  } catch (error) {
    console.warn('[exportService] download failed', error);
    return false;
  }
};

/** Convert drafted plain text to .docx and trigger the download. */
export const exportDocx = async (text: string, filename: string): Promise<boolean> => {
  const blob = await buildDraftDocxBlob(text);
  return downloadDocx(filename, blob);
};
