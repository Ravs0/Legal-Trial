import { APP_NAME } from '../constants';
import { SessionRecord } from '../types';

const sanitizeFilename = (value: string) => value
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

export const buildScorecardMarkdown = (record: SessionRecord) => {
  const metrics = record.performance;
  const scoreLine = metrics
    ? `${metrics.overallScore}/10 overall`
    : `Live courtroom score ${record.scoreBreakdown?.total ?? 'unavailable'}`;
  const improvementAreas = metrics?.improvementAreas?.length
    ? metrics.improvementAreas.map(area => `- ${area}`).join('\n')
    : '- No improvement areas were generated for this session.';

  return `# ${APP_NAME} Scorecard

${scoreLine}

## Session

- Mode: ${record.settings.practiceMode}
- Case: ${record.settings.caseDetail.title}
- Judge: ${record.settings.judgePersonality.name}
- Opposing counsel: ${record.settings.opposingCounselPersonality.name}
- Started: ${formatDate(record.startTime)}
- Ended: ${formatDate(record.endTime)}

## Scores

- Argument strength: ${metrics?.argumentStrength ?? 'N/A'}
- Precedent usage: ${metrics?.precedentUsage ?? 'N/A'}
- Legal grounding: ${metrics?.legalGrounding ?? 'N/A'}
- Response quality: ${metrics?.responseQuality ?? 'N/A'}
- Objection handling: ${metrics?.objectionHandling ?? 'N/A'}
- Courtroom presence: ${metrics?.courtroomPresence ?? 'N/A'}

## Feedback

${metrics?.feedback || 'Performance analysis was not available, but the transcript remains exportable.'}

## Improvement Areas

${improvementAreas}
`;
};

export const buildTranscriptMarkdown = (record: SessionRecord) => {
  const lines = record.transcript.map(message => {
    const sender = message.sender === 'user'
      ? 'You'
      : message.sender === 'judge'
        ? record.settings.judgePersonality.name
        : message.sender === 'opposingCounsel'
          ? record.settings.opposingCounselPersonality.name
          : 'System';
    return `### ${sender} (${formatDate(message.timestamp)})\n\n${message.text}`;
  });

  return `# ${APP_NAME} Transcript

Case: ${record.settings.caseDetail.title}

${lines.join('\n\n')}
`;
};

export const downloadMarkdown = (filename: string, contents: string) => {
  const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const scorecardFilename = (record: SessionRecord) => `${sanitizeFilename(record.settings.caseDetail.title)}-scorecard.md`;

export const transcriptFilename = (record: SessionRecord) => `${sanitizeFilename(record.settings.caseDetail.title)}-transcript.md`;
