import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ROUTES } from '../constants';
import { TrialSimContext } from '../App';
import { loadActiveSession, loadCompletedSessions, savePendingSettings } from '../services/storageService';
import { SessionRecord } from '../types';
import { createDemoSessionSettings } from '../services/demoSessionService';
import { trackEvent } from '../services/analyticsService';
import heroCourtroom from '../assets/hero_courtroom.jpg';
import draftingPen from '../assets/drafting_pen.jpg';
import libraryBooks from '../assets/library_books.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';
import strategyAstrolabe from '../assets/strategy_astrolabe.jpg';
import personaSeal from '../assets/persona_seal.jpg';
import deceptionKey from '../assets/deception_key.jpg';
import { PhotoHero } from '../components/PhotoHero';
import { PhotoTile } from '../components/PhotoTile';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';

const formatElapsed = (session: SessionRecord) => {
  const minutes = Math.max(0, Math.round((session.elapsedSeconds ?? 0) / 60));
  if (minutes <= 1) return 'just started';
  return `${minutes} min in`;
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('TrialSimContext not found');

  const { practiceMode, setPracticeMode, setCurrentSessionSettings, setError } = context;
  const modeDisplay = practiceMode ? practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1) : '';
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [completedSessions, setCompletedSessions] = useState<SessionRecord[]>([]);

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
      trackEvent('demo_trial_started', {
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
    const best = analyzed.reduce<SessionRecord | null>((acc, s) => {
      if (!acc) return s;
      return (s.performance?.overallScore || 0) > (acc.performance?.overallScore || 0) ? s : acc;
    }, null);
    return {
      done: completedSessions.length,
      latest: latest?.performance?.overallScore,
      best: best?.performance?.overallScore,
      areas: latest?.performance?.improvementAreas?.slice(0, 3) || [],
    };
  }, [completedSessions]);

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-brand-bg-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <PhotoHero
          image={heroCourtroom}
          size="lg"
          eyebrow={`${modeDisplay} mode`}
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
              <Button
                variant="ghost"
                className="!text-white/80 hover:!text-white"
                onClick={() => navigate(ROUTES.ANALYSIS)}
              >
                Review
              </Button>
            </>
          }
        />

        {/* Stats with pattern */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { k: 'Done', v: progress.done },
            { k: 'Latest', v: progress.latest ?? '—' },
            { k: 'Best', v: progress.best ?? '—' },
          ].map((x) => (
            <PatternPanel key={x.k} pattern="dots" className="px-3 py-3">
              <p className="text-[11px] text-brand-text-secondary">{x.k}</p>
              <p className="mt-1 text-lg tabular-nums text-brand-text-primary">{x.v}</p>
            </PatternPanel>
          ))}
        </div>

        {progress.areas.length > 0 && (
          <PatternPanel pattern="lines" className="px-4 py-3">
            <p className="text-[11px] text-brand-text-secondary">Focus next</p>
            <ul className="mt-2 space-y-1 text-[13px] text-brand-text-primary/90">
              {progress.areas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </PatternPanel>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[12px] text-brand-text-secondary">Practice tools</p>
            <div className="flex-1 h-px bg-brand-border relative overflow-hidden">
              <SurfacePattern variant="lines" className="!opacity-100" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PhotoTile
              title="Cases"
              description="Browse scenarios and start a trial"
              image={libraryBooks}
              onClick={() => navigate(ROUTES.LIBRARY)}
              className="min-h-[160px] sm:min-h-[180px]"
            />
            <PhotoTile
              title="Drafting"
              description="Filings with structured feedback"
              image={draftingPen}
              onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
              className="min-h-[160px] sm:min-h-[180px]"
            />
            <PhotoTile
              title="Bench"
              description="Judges and opposing counsel"
              image={judgeGavel}
              onClick={() => navigate(ROUTES.BENCH)}
              className="min-h-[160px] sm:min-h-[180px]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[12px] text-brand-text-secondary">Labs</p>
            <div className="flex-1 h-px bg-brand-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PhotoTile
              title="Strategy"
              description="Pressure-test your theory"
              image={strategyAstrolabe}
              onClick={() => navigate(ROUTES.STRATEGY)}
            />
            <PhotoTile
              title="Personas"
              description="Specialist advisors"
              image={personaSeal}
              onClick={() => navigate(ROUTES.PERSONAS)}
            />
            <PhotoTile
              title="Deception"
              description="High-pressure interrogation"
              image={deceptionKey}
              onClick={() => navigate(ROUTES.DREADLER)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
