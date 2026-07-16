import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { TrialSimContext } from '../App';
import { PerformanceMetrics, SessionRecord, TrialScoreBreakdown } from '../types';
import { ROUTES } from '../routes';
import { loadCompletedSessionById, loadLatestCompletedSession, savePendingSettings } from '../services/storageService';
import {
  analysisSourceLabel,
  buildScorecardMarkdown,
  buildTranscriptMarkdown,
  detectAnalysisSource,
  downloadMarkdown,
  scorecardFilename,
  transcriptFilename,
} from '../services/exportService';
import { trackEvent } from '../services/analyticsService';
import { SCORE_DIMENSION_LABELS } from '../services/trialScoring';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';
import { screenMedia } from '../assets';

/** Score dimensions shown on the post-session review (all /10). */
const ANALYSIS_SCORE_ROWS: { key: keyof PerformanceMetrics; label: string }[] = [
  { key: 'argumentStrength', label: 'Argument strength' },
  { key: 'precedentUsage', label: 'Precedent usage' },
  { key: 'legalGrounding', label: 'Legal grounding' },
  { key: 'responseQuality', label: 'Response quality' },
  { key: 'objectionHandling', label: 'Objection handling' },
  { key: 'courtroomPresence', label: 'Courtroom presence' },
];

const LIVE_DIM_CAP = 50;
const LIVE_TOTAL_CAP = 200;

/** Clamp a 0–outOf display score; non-finite → 0. Keeps one decimal for half-steps. */
const clampScore = (value: unknown, outOf = 10): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(outOf, n));
  return Math.round(clamped * 10) / 10;
};

const formatScore = (value: unknown, outOf = 10): string => {
  const n = clampScore(value, outOf);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const safeTitle = (record: SessionRecord): string => {
  const title = record?.settings?.caseDetail?.title;
  return typeof title === 'string' && title.trim() ? title : 'Untitled case';
};

const safeName = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value : fallback;

const formatMode = (mode: unknown): string => {
  if (typeof mode !== 'string' || !mode) return 'Unknown';
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};

const formatPhase = (phase: unknown): string => {
  if (typeof phase !== 'string' || !phase) return 'Opening';
  return phase.replace(/_/g, ' ');
};

/** Prefer analysisStatus; never trust "error" substring heuristics. */
const hasUsableImprovementAreas = (
  areas: unknown,
  analysisState?: string,
): areas is string[] => {
  if (analysisState === 'unavailable' || analysisState === 'pending') return false;
  if (!Array.isArray(areas) || areas.length === 0) return false;
  return areas.some((a) => typeof a === 'string' && a.trim().length > 0);
};

const cleanImprovementAreas = (areas: unknown): string[] => {
  if (!Array.isArray(areas)) return [];
  return areas
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());
};

const scoreLabelForOverall = (score: number): string => {
  if (score >= 8.5) return 'Strong';
  if (score >= 7) return 'Solid';
  if (score >= 5.5) return 'Developing';
  if (score >= 4) return 'Needs work';
  return 'Early stage';
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
};

const ScoreBar: React.FC<{
  label: string;
  score: number;
  outOf?: number;
  emphasize?: boolean;
}> = ({ label, score, outOf = 10, emphasize = false }) => {
  const safe = clampScore(score, outOf);
  const pct = outOf > 0 ? Math.min(100, Math.max(0, (safe / outOf) * 100)) : 0;
  return (
    <div className={`mb-4 ${emphasize ? '' : 'group'}`}>
      <div className="flex justify-between mb-1.5 gap-2">
        <span
          className={`text-[12px] sm:text-[13px] font-medium transition-colors ${
            emphasize
              ? 'text-brand-text-primary'
              : 'text-brand-text-secondary group-hover:text-brand-text-primary'
          }`}
        >
          {label}
        </span>
        <span className="text-[12px] sm:text-[13px] font-mono tracking-wider tabular-nums text-brand-text-primary shrink-0">
          {formatScore(safe, outOf)}
          <span className="opacity-40 font-normal"> / {outOf}</span>
        </span>
      </div>
      <div className="w-full bg-white/5 h-1.5 overflow-hidden border border-white/10">
        <div
          className="bg-brand-text-primary/55 h-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const PerformanceScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error('TrialSimContext not found');
  const {
    setIsLoading: setGlobalLoading,
    setCurrentSessionSettings,
    setPracticeMode,
  } = context;

  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noSession, setNoSession] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const trackedSessionId = useRef<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setGlobalLoading(true);
    setNoSession(false);

    try {
      const routerState = location.state as { sessionRecord?: SessionRecord } | null;
      const params = new URLSearchParams(location.search);
      const sessionId = params.get('sessionId');
      const recordFromState = routerState?.sessionRecord;
      const recordFromStorage = loadCompletedSessionById(sessionId) || loadLatestCompletedSession();
      const resolvedRecord = recordFromState || recordFromStorage;

      if (resolvedRecord && resolvedRecord.settings) {
        setSessionRecord(resolvedRecord);
        setPerformanceMetrics(resolvedRecord.performance ?? null);

        if (trackedSessionId.current !== resolvedRecord.id) {
          trackedSessionId.current = resolvedRecord.id;
          trackEvent('analysis_viewed', {
            mode: resolvedRecord.settings?.practiceMode ?? 'unknown',
            caseId: resolvedRecord.settings?.caseDetail?.id ?? 'unknown',
            hasAnalysis: resolvedRecord.performance ? 'yes' : 'no',
            analysisState: resolvedRecord.analysisStatus?.state ?? 'none',
          });
        }
      } else {
        setSessionRecord(null);
        setPerformanceMetrics(null);
        setNoSession(true);
      }
    } catch {
      setSessionRecord(null);
      setPerformanceMetrics(null);
      setNoSession(true);
    }

    setIsLoading(false);
    setGlobalLoading(false);
  }, [location.state, location.search, setGlobalLoading]);

  const analysisState = sessionRecord?.analysisStatus?.state;
  const analysisSource = detectAnalysisSource(sessionRecord);
  const analysisSourceLine = analysisSourceLabel(analysisSource);
  const liveScore: TrialScoreBreakdown | undefined = sessionRecord?.scoreBreakdown;
  const transcript = Array.isArray(sessionRecord?.transcript) ? sessionRecord!.transcript : [];

  const scoreRows = useMemo(() => {
    if (!performanceMetrics) return [];
    return ANALYSIS_SCORE_ROWS.map(({ key, label }) => ({
      key,
      label,
      score: clampScore(performanceMetrics[key]),
    })).sort((a, b) => a.score - b.score); // weakest first so improvement focus is obvious
  }, [performanceMetrics]);

  const weakest = scoreRows.slice(0, 2);
  const overall = performanceMetrics ? clampScore(performanceMetrics.overallScore) : 0;
  const improvementAreas = useMemo(
    () => cleanImprovementAreas(performanceMetrics?.improvementAreas),
    [performanceMetrics],
  );
  const showImprovementList = hasUsableImprovementAreas(
    performanceMetrics?.improvementAreas,
    analysisState,
  );

  const handleRedoCase = useCallback(() => {
    if (!sessionRecord?.settings) return;
    const settings = sessionRecord.settings;
    try {
      if (settings.practiceMode) setPracticeMode(settings.practiceMode);
      setCurrentSessionSettings(settings);
      savePendingSettings(settings);
      trackEvent('redo_case', {
        mode: settings.practiceMode,
        caseId: settings.caseDetail?.id ?? 'unknown',
      });
      navigate(ROUTES.PRACTICE);
    } catch {
      navigate(ROUTES.SETUP);
    }
  }, [sessionRecord, setPracticeMode, setCurrentSessionSettings, navigate]);

  const handleCopyScorecard = useCallback(async () => {
    if (!sessionRecord) return;
    const ok = await copyToClipboard(buildScorecardMarkdown(sessionRecord));
    setCopyStatus(ok ? 'ok' : 'fail');
    if (ok) {
      trackEvent('scorecard_copied', {
        mode: sessionRecord.settings?.practiceMode ?? 'unknown',
        caseId: sessionRecord.settings?.caseDetail?.id ?? 'unknown',
      });
    }
    window.setTimeout(() => setCopyStatus('idle'), 2000);
  }, [sessionRecord]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <LoadingSpinner
          text="Loading session review..."
          spinnerColor="text-brand-text-secondary"
          textColor="text-brand-text-secondary"
        />
      </div>
    );
  }

  // ── No completed session at all ──────────────────────────────────────────
  if (noSession || !sessionRecord) {
    return (
      <div className="flex-1 min-h-0 w-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
          <PhotoHero
            image={screenMedia.performance.hero}
            size="md"
            eyebrow="Post-session review"
            title="No completed hearing yet"
            subtitle="Finish a mock hearing to see its scorecard, transcript, and coaching notes."
            actions={
              <>
                <Button variant="primary" onClick={() => navigate(ROUTES.SETUP)}>
                  New trial
                </Button>
                <Button
                  variant="secondary"
                  className="!border-white/25 !text-white hover:!bg-white/10"
                  onClick={() => navigate(ROUTES.HOME)}
                >
                  Dashboard
                </Button>
              </>
            }
          />
          <EmptyState
            title="Nothing to review"
            description="Completed sessions appear here after you leave the arena. Start a demo from the dashboard or configure a full trial."
            actionLabel="Go to setup"
            onAction={() => navigate(ROUTES.SETUP)}
          />
        </div>
      </div>
    );
  }

  // ── Session exists but no performance metrics ────────────────────────────
  // Still show session meta + transcript + exports (safe partial review).
  if (!performanceMetrics) {
    const pending = analysisState === 'pending';
    const unavailable = analysisState === 'unavailable';
    const heroTitle = pending
      ? 'Analysis still running'
      : unavailable
        ? 'Analysis unavailable'
        : 'Scores not ready';
    const heroSubtitle = pending
      ? 'This session is saved. Coaching scores were not attached yet. Transcript export still works.'
      : unavailable
        ? 'Performance analysis could not be generated. Transcript and session details remain available.'
        : 'This hearing has no attached scorecard. You can still export the transcript and retry the same case.';

    return (
      <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn relative z-10">
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-5 pb-12">
          <PhotoHero
            image={screenMedia.performance.hero}
            size="md"
            eyebrow="Post-session review"
            title={heroTitle}
            subtitle={`${safeTitle(sessionRecord)}. ${heroSubtitle}`}
            actions={
              <>
                <Button variant="primary" onClick={handleRedoCase}>
                  Redo this case
                </Button>
                <Button
                  variant="secondary"
                  className="!border-white/25 !text-white hover:!bg-white/10"
                  onClick={() =>
                    downloadMarkdown(
                      transcriptFilename(sessionRecord),
                      buildTranscriptMarkdown(sessionRecord),
                    )
                  }
                  disabled={transcript.length === 0}
                >
                  Export transcript
                </Button>
                <Button
                  variant="ghost"
                  className="!text-white/80 hover:!text-white"
                  onClick={() => navigate(ROUTES.SETUP)}
                >
                  New trial
                </Button>
              </>
            }
          />

          {liveScore && (
            <PatternPanel pattern="grid" className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-1">
                Live structure score
              </p>
              <p className="text-[12px] text-brand-text-secondary/80 mb-4">
                Local advocacy signals from the arena (not a merits ruling). Scale 0–{LIVE_TOTAL_CAP}.
              </p>
              <div className="flex items-end justify-between mb-4">
                <span className="text-[13px] text-brand-text-secondary">Total</span>
                <span className="text-2xl font-mono font-semibold text-brand-text-primary tabular-nums">
                  {clampScore(liveScore.total, LIVE_TOTAL_CAP)}
                  <span className="text-sm opacity-40 font-normal"> / {LIVE_TOTAL_CAP}</span>
                </span>
              </div>
              <div className="space-y-2">
                {(
                  [
                    ['engagement', liveScore.engagement],
                    ['advocacy', liveScore.advocacy],
                    ['objections', liveScore.objections],
                    ['responsiveness', liveScore.responsiveness],
                    ['professionalism', liveScore.professionalism],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-[7.5rem] text-[10px] font-mono text-brand-text-secondary/80 truncate">
                      {SCORE_DIMENSION_LABELS[key]}
                    </span>
                    <div className="flex-1 h-1 bg-white/5 overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-brand-text-primary/50"
                        style={{
                          width: `${Math.min(100, Math.max(0, (clampScore(value, LIVE_DIM_CAP) / LIVE_DIM_CAP) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-[10px] font-mono text-brand-text-primary">
                      {clampScore(value, LIVE_DIM_CAP)}
                    </span>
                  </div>
                ))}
              </div>
            </PatternPanel>
          )}

          <SessionDetailsPanel record={sessionRecord} />
          <TranscriptPanel record={sessionRecord} transcript={transcript} />

          <div className="relative pt-6 border-t border-brand-border flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3">
            <Button onClick={handleRedoCase} variant="primary" className="w-full sm:w-auto">
              Redo this case
            </Button>
            <Button onClick={() => navigate(ROUTES.SETUP)} variant="outline" className="w-full sm:w-auto">
              New trial
            </Button>
            <Button onClick={() => navigate(ROUTES.HOME)} variant="ghost" className="w-full sm:w-auto border border-white/10">
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full scorecard ───────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn relative z-10">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6 pb-12">
        <PhotoHero
          image={screenMedia.performance.hero}
          size="md"
          eyebrow="Post-session review"
          title="Performance analysis"
          subtitle={
            <span>
              {safeTitle(sessionRecord)}
              <span className="text-white/40"> · </span>
              {formatScore(overall)}/10
              <span className="text-white/40"> · </span>
              {scoreLabelForOverall(overall)}
              {liveScore != null && (
                <>
                  <span className="text-white/40"> · </span>
                  structure {clampScore(liveScore.total, LIVE_TOTAL_CAP)}/{LIVE_TOTAL_CAP}
                </>
              )}
            </span>
          }
          actions={
            <>
              <Button variant="primary" onClick={handleRedoCase}>
                Redo this case
              </Button>
              <Button
                variant="secondary"
                className="!border-white/25 !text-white hover:!bg-white/10"
                onClick={() => navigate(ROUTES.HOME)}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                className="!text-white/80 hover:!text-white"
                onClick={() => navigate(ROUTES.SETUP)}
              >
                New trial
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <div className="lg:col-span-1 space-y-4 sm:space-y-5">
            <SessionDetailsPanel record={sessionRecord} stripImage={screenMedia.performance.sessionStrip} />

            <PatternPanel pattern="grid" className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary">
                  Score breakdown
                </p>
                <span className="text-[10px] font-mono text-brand-text-secondary/70 border border-brand-border px-1.5 py-0.5 rounded">
                  /10
                </span>
              </div>
              <p className="text-[11px] text-brand-text-secondary/70 mb-4">
                Weakest dimensions first. Coaching scale only; not a court ruling.
              </p>

              <div className="space-y-0.5">
                {scoreRows.map((row) => (
                  <ScoreBar key={row.key} label={row.label} score={row.score} />
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-brand-border">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <span className="block text-[13px] text-brand-text-secondary">Overall</span>
                    <span className="text-[11px] text-brand-text-secondary/70">
                      {scoreLabelForOverall(overall)}
                    </span>
                  </div>
                  <span className="text-2xl font-mono font-semibold text-brand-text-primary tabular-nums">
                    {formatScore(overall)}
                    <span className="text-sm opacity-40 font-normal"> / 10</span>
                  </span>
                </div>
                <div className="w-full bg-white/5 h-2 overflow-hidden border border-white/10">
                  <div
                    className="bg-brand-text-primary/60 h-full transition-all duration-1000 ease-out"
                    style={{ width: `${(overall / 10) * 100}%` }}
                  />
                </div>
              </div>

              {weakest.length > 0 && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-2">
                    Lowest scores
                  </p>
                  <ul className="space-y-1">
                    {weakest.map((row) => (
                      <li
                        key={row.key}
                        className="flex justify-between text-[12px] text-brand-text-primary/90"
                      >
                        <span>{row.label}</span>
                        <span className="font-mono tabular-nums text-brand-text-secondary">
                          {formatScore(row.score)}/10
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </PatternPanel>

            {liveScore && (
              <PatternPanel pattern="dots" className="p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-1">
                  Live structure score
                </p>
                <p className="text-[11px] text-brand-text-secondary/70 mb-3">
                  Arena signals (0–{LIVE_TOTAL_CAP}). Separate from the /10 coaching scores above.
                </p>
                <div className="flex items-end justify-between mb-3">
                  <span className="text-[12px] text-brand-text-secondary">Total</span>
                  <span className="text-xl font-mono font-semibold text-brand-text-primary tabular-nums">
                    {clampScore(liveScore.total, LIVE_TOTAL_CAP)}
                    <span className="text-xs opacity-40 font-normal"> / {LIVE_TOTAL_CAP}</span>
                  </span>
                </div>
                <div className="space-y-2">
                  {(
                    [
                      ['engagement', liveScore.engagement],
                      ['advocacy', liveScore.advocacy],
                      ['objections', liveScore.objections],
                      ['responsiveness', liveScore.responsiveness],
                      ['professionalism', liveScore.professionalism],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-[7.5rem] text-[10px] font-mono text-brand-text-secondary/80 truncate">
                        {SCORE_DIMENSION_LABELS[key]}
                      </span>
                      <div className="flex-1 h-1 bg-white/5 overflow-hidden border border-white/10">
                        <div
                          className="h-full bg-brand-text-primary/50"
                          style={{
                            width: `${Math.min(100, Math.max(0, (clampScore(value, LIVE_DIM_CAP) / LIVE_DIM_CAP) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-[10px] font-mono text-brand-text-primary">
                        {clampScore(value, LIVE_DIM_CAP)}
                      </span>
                    </div>
                  ))}
                </div>
              </PatternPanel>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4 sm:space-y-5">
            <PatternPanel pattern="lines" className="p-4 sm:p-6 h-full">
              <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-3">
                Detailed feedback
              </p>
              <div className="text-brand-text-primary text-[14px] leading-relaxed">
                <p>
                  {typeof performanceMetrics.feedback === 'string' && performanceMetrics.feedback.trim()
                    ? performanceMetrics.feedback.trim()
                    : 'No specific feedback was attached to this session.'}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-brand-border">
                <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-4">
                  Areas to improve
                </p>
                {showImprovementList && improvementAreas.length > 0 ? (
                  <ul className="space-y-2.5">
                    {improvementAreas.map((area, index) => (
                      <li
                        key={`${index}-${area.slice(0, 24)}`}
                        className="flex items-start gap-3 p-3 border border-brand-border bg-brand-bg-primary"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-white/15 text-[10px] font-mono text-brand-text-secondary">
                          {index + 1}
                        </span>
                        <span className="text-brand-text-primary/90 text-[13px] leading-relaxed">
                          {area}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-3 border border-dashed border-brand-border bg-brand-bg-primary/60">
                    <p className="text-brand-text-secondary text-[13px] leading-relaxed">
                      {analysisState === 'unavailable'
                        ? 'Improvement notes were not generated for this session. Export the transcript and redo the case to try again.'
                        : weakest.length > 0
                          ? `Focus next on ${weakest.map((w) => w.label.toLowerCase()).join(' and ')}. No extra coaching list was attached.`
                          : 'No specific improvement areas identified.'}
                    </p>
                  </div>
                )}
              </div>

              {(analysisState || performanceMetrics) && (
                <p className="mt-4 text-[11px] font-mono text-brand-text-secondary/60">
                  Analysis status: {analysisState ?? 'unknown'}
                  {sessionRecord.analysisStatus?.error
                    ? ` · ${sessionRecord.analysisStatus.error}`
                    : ''}
                  {` · Source: ${analysisSourceLine}`}
                </p>
              )}
            </PatternPanel>
          </div>
        </div>

        <TranscriptPanel record={sessionRecord} transcript={transcript} />

        <div className="relative pt-6 border-t border-brand-border flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3">
          <SurfacePattern variant="lines" className="opacity-50 !absolute inset-x-0 -top-0 h-20" />
          <Button onClick={handleRedoCase} variant="primary" className="relative z-10 w-full sm:w-auto">
            Redo this case
          </Button>
          <Button onClick={() => navigate(ROUTES.SETUP)} variant="outline" className="relative z-10 w-full sm:w-auto">
            New trial
          </Button>
          <Button onClick={() => navigate(ROUTES.HOME)} variant="ghost" className="relative z-10 w-full sm:w-auto border border-white/10">
            Dashboard
          </Button>
          <Button
            variant="ghost"
            className="relative z-10 w-full sm:w-auto border border-white/10"
            onClick={handleCopyScorecard}
          >
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'fail' ? 'Copy failed' : 'Copy scorecard'}
          </Button>
          <Button
            variant="ghost"
            className="relative z-10 w-full sm:w-auto border border-white/10"
            onClick={() => {
              downloadMarkdown(scorecardFilename(sessionRecord), buildScorecardMarkdown(sessionRecord));
              trackEvent('scorecard_downloaded', {
                mode: sessionRecord.settings?.practiceMode ?? 'unknown',
                caseId: sessionRecord.settings?.caseDetail?.id ?? 'unknown',
              });
            }}
          >
            Download scorecard
          </Button>
          {transcript.length > 0 && (
            <Button
              variant="ghost"
              className="relative z-10 w-full sm:w-auto border border-white/10"
              onClick={() => {
                downloadMarkdown(transcriptFilename(sessionRecord), buildTranscriptMarkdown(sessionRecord));
                trackEvent('transcript_downloaded', {
                  mode: sessionRecord.settings?.practiceMode ?? 'unknown',
                  caseId: sessionRecord.settings?.caseDetail?.id ?? 'unknown',
                });
              }}
            >
              Download transcript
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Shared panels ────────────────────────────────────────────────────────────

const SessionDetailsPanel: React.FC<{
  record: SessionRecord;
  stripImage?: string;
}> = ({ record, stripImage }) => {
  const rows = [
    { k: 'Mode', v: formatMode(record.settings?.practiceMode) },
    { k: 'Case', v: safeTitle(record) },
    { k: 'Bench', v: safeName(record.settings?.judgePersonality?.name, 'Unknown judge') },
    {
      k: 'Counsel',
      v: `${safeName(record.settings?.opposingCounselPersonality?.name, 'Unknown counsel')}${
        record.settings?.opposingCounselPersonality?.specialty
          ? ` · ${record.settings.opposingCounselPersonality.specialty}`
          : ''
      }`,
    },
    { k: 'Phase', v: formatPhase(record.activePhase) },
    {
      k: 'When',
      v: (() => {
        try {
          const start = record.startTime ? new Date(record.startTime) : null;
          if (!start || Number.isNaN(start.getTime())) return 'Unknown';
          const date = start.toLocaleDateString();
          if (!record.endTime) return date;
          const end = new Date(record.endTime);
          if (Number.isNaN(end.getTime())) return date;
          return `${date} · ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          return 'Unknown';
        }
      })(),
    },
  ];

  return (
    <PatternPanel pattern="dots" className="p-0 overflow-hidden">
      {stripImage ? (
        <div className="relative h-16 border-b border-brand-border overflow-hidden">
          <img src={stripImage} alt="" className="absolute inset-0 w-full h-full object-cover grayscale" />
          <div className="absolute inset-0 bg-black/75" />
          <div className="relative z-10 h-full flex items-center px-4">
            <h3 className="text-[15px] font-medium text-white">Session details</h3>
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-5 pt-4 sm:pt-5">
          <h3 className="text-[15px] font-medium text-brand-text-primary">Session details</h3>
        </div>
      )}
      <div className="p-4 sm:p-5 space-y-3.5 text-[13px]">
        {rows.map((row) => (
          <div key={row.k}>
            <span className="block text-[11px] uppercase tracking-wide text-brand-text-secondary mb-0.5">
              {row.k}
            </span>
            <span className="text-brand-text-primary font-medium">{row.v}</span>
          </div>
        ))}
      </div>
    </PatternPanel>
  );
};

const TranscriptPanel: React.FC<{
  record: SessionRecord;
  transcript: SessionRecord['transcript'];
}> = ({ record, transcript }) => {
  if (!transcript || transcript.length === 0) {
    return (
      <PatternPanel pattern="dots" className="p-4 sm:p-6">
        <EmptyState
          title="No transcript lines"
          description="This session has no recorded messages. Exports will only include session metadata."
        />
      </PatternPanel>
    );
  }

  return (
    <PatternPanel pattern="dots" className="p-0 overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-brand-border flex justify-between items-center gap-3">
        <h3 className="text-[15px] font-medium text-brand-text-primary">Transcript</h3>
        <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary border border-brand-border px-2 py-0.5 rounded tabular-nums">
          {transcript.length} lines
        </span>
      </div>
      <div className="max-h-[560px] overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
        {transcript.map((msg, index) => {
          const isUser = msg.sender === 'user';
          let senderName = 'You (Counsel)';
          if (msg.sender === 'judge') {
            senderName = safeName(record.settings?.judgePersonality?.name, 'Judge');
          } else if (msg.sender === 'opposingCounsel') {
            const oc = record.settings?.opposingCounselPersonality;
            const name = safeName(oc?.name, 'Opposing counsel');
            senderName = oc?.specialty ? `${name} (${oc.specialty})` : name;
          } else if (msg.sender === 'system') {
            senderName = 'System';
          }

          const text = typeof msg.text === 'string' ? msg.text : '';
          if (!text.trim()) return null;

          return (
            <div
              key={msg.id || `line-${index}`}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}
            >
              <span className="text-[10px] uppercase tracking-wide text-brand-text-secondary mb-1 opacity-80">
                {senderName}
              </span>
              <div
                className={`p-3.5 max-w-[85%] sm:max-w-[75%] leading-relaxed text-[13px] sm:text-[14px] border ${
                  isUser
                    ? 'bg-brand-bg-primary border-white/20 text-brand-text-primary'
                    : 'bg-brand-bg-primary border-brand-border text-brand-text-primary'
                }`}
              >
                <span className="whitespace-pre-wrap break-words">{text}</span>
              </div>
            </div>
          );
        })}
      </div>
    </PatternPanel>
  );
};

export default PerformanceScreen;
