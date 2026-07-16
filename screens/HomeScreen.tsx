import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ROUTES } from '../constants';
import { TrialSimContext } from '../App';
import { loadActiveSession, loadCompletedSessions, savePendingSettings } from '../services/storageService';
import { SessionRecord } from '../types';
import { createDemoSessionSettings } from '../services/demoSessionService';
import { trackDemoTrialStarted, trackEvent } from '../services/analyticsService';
import { screenMedia } from '../assets';
import { PhotoHero } from '../components/PhotoHero';
import { PhotoTile } from '../components/PhotoTile';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';

const formatElapsed = (session: SessionRecord) => {
  const minutes = Math.max(0, Math.round((session.elapsedSeconds ?? 0) / 60));
  if (minutes <= 1) return 'just started';
  return `${minutes} min in`;
};

/** Clamp analysis score 0–10 for display bars. */
const clampTen = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
};

const formatScore = (value: number | undefined | null): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  const n = clampTen(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const scoreLabel = (score: number): string => {
  if (score >= 8.5) return 'Strong';
  if (score >= 7) return 'Solid';
  if (score >= 5.5) return 'Developing';
  if (score >= 4) return 'Needs work';
  return 'Early stage';
};

type Trend = 'up' | 'down' | 'flat' | 'none';

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('TrialSimContext not found');

  const { practiceMode, setPracticeMode, setCurrentSessionSettings, setError } = context;
  const modeDisplay = practiceMode ? practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1) : '';
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [completedSessions, setCompletedSessions] = useState<SessionRecord[]>([]);
  const [labsOpen, setLabsOpen] = useState(false);

  useEffect(() => {
    trackEvent('dashboard_viewed', { mode: practiceMode || 'none' });
  }, [practiceMode]);

  useEffect(() => {
    const sync = () => {
      setActiveSession(loadActiveSession());
      setCompletedSessions(loadCompletedSessions());
    };
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const handleDemoStart = () => {
    try {
      const settings = createDemoSessionSettings();
      trackDemoTrialStarted({
        source: 'dashboard',
        mode: settings.practiceMode,
        caseId: settings.caseDetail.id,
        caseTitle: settings.caseDetail.title,
      });
      setPracticeMode(settings.practiceMode);
      setCurrentSessionSettings(settings);
      savePendingSettings(settings);
      navigate(ROUTES.PRACTICE);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start demo trial.');
    }
  };

  const progress = useMemo(() => {
    const analyzed = completedSessions.filter((s) => s.performance);
    const latest = analyzed[0] || null;
    const previous = analyzed[1] || null;
    const best = analyzed.reduce<SessionRecord | null>((acc, s) => {
      if (!acc) return s;
      return (s.performance?.overallScore || 0) > (acc.performance?.overallScore || 0) ? s : acc;
    }, null);

    const latestScore = latest?.performance?.overallScore;
    const previousScore = previous?.performance?.overallScore;
    let trend: Trend = 'none';
    if (
      typeof latestScore === 'number' &&
      typeof previousScore === 'number' &&
      Number.isFinite(latestScore) &&
      Number.isFinite(previousScore)
    ) {
      const delta = latestScore - previousScore;
      if (delta > 0.15) trend = 'up';
      else if (delta < -0.15) trend = 'down';
      else trend = 'flat';
    }

    /** Newest-first scores for spark bars (max 6). */
    const recentScores = analyzed
      .slice(0, 6)
      .map((s) => clampTen(s.performance?.overallScore))
      .filter((n) => n > 0);

    const unscored = Math.max(0, completedSessions.length - analyzed.length);

    return {
      done: completedSessions.length,
      scored: analyzed.length,
      unscored,
      latest: latestScore,
      best: best?.performance?.overallScore,
      latestTitle: latest?.settings?.caseDetail?.title || null,
      bestTitle: best?.settings?.caseDetail?.title || null,
      areas: latest?.performance?.improvementAreas?.filter((a) => typeof a === 'string' && a.trim()).slice(0, 3) || [],
      trend,
      recentScores,
      avg:
        recentScores.length > 0
          ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
          : null,
    };
  }, [completedSessions]);

  const trendCopy =
    progress.trend === 'up'
      ? 'Up vs last'
      : progress.trend === 'down'
        ? 'Down vs last'
        : progress.trend === 'flat'
          ? 'Flat vs last'
          : null;

  const strip = screenMedia.home.strip;

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-brand-bg-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* One primary decision: resume / demo */}
        <PhotoHero
          image={activeSession ? screenMedia.home.heroActive : screenMedia.home.heroIdle}
          size="lg"
          eyebrow={modeDisplay ? `${modeDisplay} mode` : 'Workspace'}
          title={
            activeSession
              ? 'Continue your hearing'
              : progress.done
                ? 'Ready for another run'
                : 'Practice, score, improve'
          }
          subtitle={
            activeSession
              ? `${activeSession.settings.caseDetail.title} · ${formatElapsed(activeSession)}`
              : 'Start a demo or configure a full trial. Everything else is optional.'
          }
          actions={
            <>
              <Button
                variant="primary"
                onClick={activeSession ? () => navigate(ROUTES.PRACTICE) : handleDemoStart}
              >
                {activeSession ? 'Resume hearing' : 'Start demo'}
              </Button>
              <Button
                variant="secondary"
                className="!border-white/25 !text-white hover:!bg-white/10"
                onClick={() => navigate(ROUTES.SETUP)}
              >
                New trial
              </Button>
              {progress.done > 0 && (
                <Button
                  variant="ghost"
                  className="!text-white/80 hover:!text-white"
                  onClick={() => navigate(ROUTES.ANALYSIS)}
                >
                  Review
                </Button>
              )}
            </>
          }
        />

        {/* Loop health: dense stats + spark trail (design tip 11) */}
        <section aria-label="Loop health">
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Loop health</p>
            <div className="flex-1 h-px bg-brand-border relative overflow-hidden">
              <SurfacePattern variant="dots" className="!opacity-100" />
            </div>
            {progress.scored > 0 && (
              <button
                type="button"
                onClick={() => navigate(ROUTES.ANALYSIS)}
                className="text-[11px] text-brand-text-secondary hover:text-brand-text-primary transition-colors"
              >
                Open review
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg border border-brand-border overflow-hidden bg-brand-border">
            <StatCell
              label="Done"
              value={String(progress.done)}
              hint={progress.done === 0 ? 'No hearings yet' : progress.unscored > 0 ? `${progress.unscored} unscored` : 'All scored'}
            />
            <StatCell
              label="Scored"
              value={String(progress.scored)}
              hint={progress.avg != null ? `Avg ${formatScore(progress.avg)} / 10` : 'After a full run'}
            />
            <StatCell
              label="Latest"
              value={formatScore(progress.latest)}
              hint={
                progress.latest != null
                  ? `${scoreLabel(clampTen(progress.latest))}${trendCopy ? ` · ${trendCopy}` : ''}`
                  : 'Out of 10'
              }
              bar={progress.latest != null ? clampTen(progress.latest) : null}
              emphasize
            />
            <StatCell
              label="Best"
              value={formatScore(progress.best)}
              hint={progress.bestTitle ? progress.bestTitle : 'Out of 10'}
              bar={progress.best != null ? clampTen(progress.best) : null}
            />
          </div>

          {/* Recent score spark bars */}
          {progress.recentScores.length > 0 && (
            <PatternPanel pattern="lines" className="mt-2 px-3 py-3 sm:px-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-brand-text-secondary">Recent scores</p>
                  {progress.latestTitle && (
                    <p className="mt-0.5 text-[12px] text-brand-text-primary/85 truncate">
                      Last: {progress.latestTitle}
                    </p>
                  )}
                </div>
                <div
                  className="flex items-end gap-1 h-10 shrink-0"
                  aria-label={`Recent scores: ${progress.recentScores.map(formatScore).join(', ')}`}
                >
                  {[...progress.recentScores].reverse().map((score, i) => {
                    const h = Math.max(12, Math.round((score / 10) * 40));
                    const isNewest = i === progress.recentScores.length - 1;
                    return (
                      <div
                        key={`${score}-${i}`}
                        title={`${formatScore(score)} / 10`}
                        className={`w-2 sm:w-2.5 rounded-[1px] ${
                          isNewest ? 'bg-white/70' : 'bg-white/25'
                        }`}
                        style={{ height: h }}
                      />
                    );
                  })}
                </div>
              </div>
            </PatternPanel>
          )}

          {progress.done === 0 && (
            <PatternPanel pattern="dots" className="mt-2 px-4 py-3">
              <p className="text-[13px] text-brand-text-primary/90">No completed hearings yet</p>
              <p className="mt-1 text-[12px] text-brand-text-secondary leading-relaxed">
                Finish a demo or full trial to unlock scores, focus areas, and review.
              </p>
            </PatternPanel>
          )}
        </section>

        {progress.areas.length > 0 && (
          <PatternPanel pattern="grid" className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Focus next</p>
                <ul className="mt-2 space-y-1.5 text-[13px] text-brand-text-primary/90">
                  {progress.areas.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-[7px] w-1 h-1 rounded-full bg-white/40 shrink-0" aria-hidden />
                      <span className="leading-snug">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => navigate(ROUTES.ANALYSIS)}
                className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary hover:text-brand-text-primary border border-brand-border px-2.5 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors"
              >
                Review
              </button>
            </div>
          </PatternPanel>
        )}

        {/* Motif strip: wires remaining classic stills (pen, gavel, scales, astrolabe, key, abstract) */}
        <div
          className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-lg border border-brand-border overflow-hidden bg-brand-border"
          aria-hidden
        >
          {strip.map((cell) => (
            <div key={cell.label} className="relative h-12 sm:h-14 bg-brand-bg-secondary overflow-hidden">
              <img
                src={cell.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-75 grayscale contrast-[1.05] brightness-[0.92] saturate-0"
                loading="lazy"
                decoding="async"
              />
              <div
                className="absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 9px)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <span className="absolute bottom-1 left-1.5 text-[9px] uppercase tracking-[0.1em] text-white/55">
                {cell.label}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Practice tools</p>
            <div className="flex-1 h-px bg-brand-border relative overflow-hidden">
              <SurfacePattern variant="lines" className="!opacity-100" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <PhotoTile
              title="Cases"
              description="Browse scenarios and start a trial"
              image={screenMedia.home.cases}
              badge="Library"
              meta={progress.done > 0 ? `${progress.done} done` : undefined}
              onClick={() => navigate(ROUTES.LIBRARY)}
            />
            <PhotoTile
              title="Drafting"
              description="Filings with structured feedback"
              image={screenMedia.home.drafting}
              badge="Write"
              onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
            />
            <PhotoTile
              title="Bench"
              description="Judges and opposing counsel"
              image={screenMedia.home.bench}
              badge="Reference"
              onClick={() => navigate(ROUTES.BENCH)}
            />
          </div>
        </div>

        {/* Labs last, collapsed by default */}
        <div>
          <button
            type="button"
            onClick={() => setLabsOpen((v) => !v)}
            className="w-full flex items-center gap-2 mb-2.5 text-left group"
            aria-expanded={labsOpen}
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary group-hover:text-brand-text-primary transition-colors">
              Labs
              <span className="ml-2 normal-case tracking-normal text-brand-text-secondary/60">Optional</span>
            </p>
            <div className="flex-1 h-px bg-brand-border" />
            <span className="text-[11px] text-brand-text-secondary/70 tabular-nums" aria-hidden>
              {labsOpen ? '−' : '+'}
            </span>
          </button>
          {labsOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <PhotoTile
                title="Strategy"
                description="Pressure-test your theory"
                image={screenMedia.home.strategy}
                badge="Lab"
                onClick={() => navigate(ROUTES.STRATEGY)}
                compact
              />
              <PhotoTile
                title="Personas"
                description="Specialist advisors"
                image={screenMedia.home.personas}
                badge="Lab"
                onClick={() => navigate(ROUTES.PERSONAS)}
                compact
              />
              <PhotoTile
                title="Deception"
                description="High-pressure interrogation"
                image={screenMedia.home.deception}
                badge="Lab"
                onClick={() => navigate(ROUTES.DREADLER)}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Single loop-health cell: gap-px grid, monochrome bar, no glow. */
const StatCell: React.FC<{
  label: string;
  value: string;
  hint?: string;
  bar?: number | null;
  emphasize?: boolean;
}> = ({ label, value, hint, bar = null, emphasize = false }) => (
  <div className="relative bg-brand-bg-secondary px-3 py-3 sm:px-3.5 sm:py-3.5 min-h-[76px]">
    <SurfacePattern variant="dots" className="opacity-80" />
    <div className="relative z-10">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">{label}</p>
      <p
        className={`mt-1 text-xl sm:text-2xl tabular-nums tracking-tight ${
          emphasize ? 'text-white' : 'text-brand-text-primary'
        }`}
      >
        {value}
        {(label === 'Latest' || label === 'Best') && value !== '-' && (
          <span className="ml-1 text-[11px] text-brand-text-secondary/70 font-normal">/10</span>
        )}
      </p>
      {bar != null && (
        <div className="mt-2 h-1 w-full bg-white/5 border border-white/10 overflow-hidden">
          <div
            className={`h-full ${emphasize ? 'bg-white/65' : 'bg-white/35'}`}
            style={{ width: `${Math.max(0, Math.min(100, (bar / 10) * 100))}%` }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-1.5 text-[10px] sm:text-[11px] text-brand-text-secondary/75 truncate leading-snug">
          {hint}
        </p>
      )}
    </div>
  </div>
);

export default HomeScreen;
