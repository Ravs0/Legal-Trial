import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ROUTES, APP_NAME } from '../constants';
import { PlusCircleIcon } from '../components/icons/PlusCircleIcon';
import { TrialSimContext } from '../App';
import { loadActiveSession, loadCompletedSessions, savePendingSettings } from '../services/storageService';
import { SessionRecord } from '../types';
import { createDemoSessionSettings } from '../services/demoSessionService';
import { trackEvent } from '../services/analyticsService';
import strategyAstrolabe from '../assets/strategy_astrolabe.jpg';
import personaSeal from '../assets/persona_seal.jpg';
import deceptionKey from '../assets/deception_key.jpg';
import draftingPen from '../assets/drafting_pen.jpg';
import libraryBooks from '../assets/library_books.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';
import heroCourtroom from '../assets/hero_courtroom.jpg';

interface BentoItemProps {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  buttonText?: string;
  className?: string;
}

const BentoItem: React.FC<BentoItemProps> = ({ title, description, icon, onClick, buttonText, className = '' }) => {
  const isImgIcon = React.isValidElement(icon) && icon.type === 'img';
  const imgElement = isImgIcon ? (icon as React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>) : null;
  const imgSrc = imgElement ? imgElement.props.src : null;

  return (
    <div
      className={`relative overflow-hidden flex flex-col rounded-2xl border transition-all duration-500 ease-out group bg-brand-bg-secondary border-brand-border ${onClick ? 'cursor-pointer focus-ring hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:border-brand-accent/50' : ''} ${className}`}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      role={onClick ? 'button' : undefined}
    >
      {imgSrc && (
        <>
          <img
            src={imgSrc}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-45 group-hover:opacity-65"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-dark/95 via-brand-bg-dark/85 to-brand-bg-dark/55" />
        </>
      )}

      <div className="relative z-10 w-full h-full flex-grow flex flex-col p-6 lg:p-8">
        {icon && !imgSrc && (
          <div className="w-12 h-12 rounded-xl bg-brand-bg-primary border border-brand-border flex items-center justify-center mb-5 transition-all duration-300 group-hover:border-brand-accent/30 group-hover:bg-brand-bg-secondary overflow-hidden">
            <div className="text-brand-accent">
              {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'h-5 w-5 lg:h-6 lg:w-6' })}
            </div>
          </div>
        )}

        <h3 className="font-serif mb-2 lg:mb-3 text-base lg:text-xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300">{title}</h3>
        <div className="font-light flex-grow leading-relaxed text-xs lg:text-sm text-brand-text-secondary/85 mb-4 lg:mb-6 group-hover:text-brand-text-primary transition-colors duration-300">{description}</div>

        {buttonText && (
          <div className="mt-auto w-full pt-4 border-t border-brand-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-2 text-brand-accent hover:text-brand-accent-hover transition-all bg-brand-bg-dark/40 backdrop-blur-sm border border-brand-border/20 rounded-xl py-1.5"
            >
              <span>[ {buttonText} ]</span>
              <span className="transform transition-transform group-hover:translate-x-1">-&gt;</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const formatElapsed = (session: SessionRecord) => {
  const minutes = Math.max(0, Math.round((session.elapsedSeconds ?? 0) / 60));
  if (minutes <= 1) return 'just started';
  return `${minutes} min elapsed`;
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error('TrialSimContext not found');

  const {
    practiceMode,
    setPracticeMode,
    setCurrentSessionSettings,
    setError,
  } = context;
  const modeDisplay = practiceMode ? (practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)) : 'Selected';
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [completedSessions, setCompletedSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    trackEvent('dashboard_viewed', { mode: practiceMode || 'none' });
  }, [practiceMode]);

  useEffect(() => {
    const syncSessions = () => {
      setActiveSession(loadActiveSession());
      setCompletedSessions(loadCompletedSessions());
    };

    syncSessions();
    window.addEventListener('focus', syncSessions);
    window.addEventListener('storage', syncSessions);
    return () => {
      window.removeEventListener('focus', syncSessions);
      window.removeEventListener('storage', syncSessions);
    };
  }, []);

  const handleDemoStart = () => {
    try {
      const settings = createDemoSessionSettings();
      if (completedSessions.length > 0) {
        trackEvent('second_session_started', { source: 'dashboard_demo', completedSessions: completedSessions.length });
      }
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

  const draftingDescription = practiceMode === 'indian'
    ? 'Draft plaints, petitions, notices, procedural filings, and get AI-guided feedback grounded in local practice.'
    : 'Refine memorials, submissions, agreements, and strategy writing with tighter AI feedback.';

  const quickStats = useMemo(() => {
    if (!activeSession) return null;
    return {
      title: activeSession.settings.caseDetail.title,
      phase: (activeSession.activePhase || 'opening').replace('_', ' '),
      elapsed: formatElapsed(activeSession),
    };
  }, [activeSession]);

  const progressSummary = useMemo(() => {
    const analyzed = completedSessions.filter(session => session.performance);
    const latest = analyzed[0] || null;
    const best = analyzed.reduce<SessionRecord | null>((currentBest, session) => {
      if (!currentBest) return session;
      return (session.performance?.overallScore || 0) > (currentBest.performance?.overallScore || 0) ? session : currentBest;
    }, null);

    return {
      completedCount: completedSessions.length,
      analyzedCount: analyzed.length,
      latestScore: latest?.performance?.overallScore,
      bestScore: best?.performance?.overallScore,
      latestCase: latest?.settings.caseDetail.title,
      improvementAreas: latest?.performance?.improvementAreas?.slice(0, 3) || [],
    };
  }, [completedSessions]);

  return (
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-6 animate-fadeIn relative">
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-4 lg:gap-6">
        <div className="rounded-2xl border border-brand-border bg-brand-bg-secondary overflow-hidden relative min-h-[320px]">
          <img src={heroCourtroom} alt="Courtroom" className="absolute inset-0 w-full h-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-dark via-brand-bg-dark/88 to-brand-bg-dark/45" />
          <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-6 lg:p-8 gap-6">
            <div className="max-w-2xl">
              <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-brand-accent/90">{modeDisplay} Practice</p>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-brand-text-primary">Practice, Score, Improve</h1>
              <p className="mt-4 text-sm sm:text-base lg:text-lg text-brand-text-secondary/90 max-w-3xl leading-relaxed">
                {APP_NAME} is now centered on the courtroom loop: start quickly, argue a case, get scored, export the result, and come back sharper.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <Button variant="primary" size="lg" onClick={handleDemoStart} className="w-full">
                <PlusCircleIcon className="h-5 w-5 mr-2" />
                Start Demo
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate(ROUTES.SETUP)} className="w-full">
                Start Trial
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate(activeSession ? ROUTES.PRACTICE : ROUTES.DRAFTING_STUDIO)} className="w-full">
                {activeSession ? 'Resume' : 'Drafting'}
              </Button>
              <Button variant="ghost" size="lg" onClick={() => navigate(ROUTES.ANALYSIS)} className="w-full border border-white/10">
                Review
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-bg-secondary p-5 sm:p-6 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-accent/80">Progress Loop</p>
            <h2 className="mt-2 text-xl font-serif font-semibold text-brand-text-primary">
              {activeSession ? 'Continue your live hearing' : progressSummary.completedCount ? 'Build on your last score' : 'Get your first score'}
            </h2>
            <p className="mt-2 text-sm text-brand-text-secondary/80 leading-relaxed">
              {activeSession
                ? 'Resume the active transcript and keep the courtroom momentum.'
                : progressSummary.completedCount
                  ? 'Use your completed sessions as a training record and repeat the loop.'
                  : 'Run the demo trial first so you can feel the product before configuring anything.'}
            </p>
          </div>

          {quickStats && (
            <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/10 p-4 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-accent/85">Active Session</p>
              <h3 className="text-sm font-semibold text-white/90 leading-snug">{quickStats.title}</h3>
              <div className="grid grid-cols-2 gap-3 text-xs text-brand-text-secondary/80">
                <div className="rounded-lg border border-white/8 bg-brand-bg-dark/35 px-3 py-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/45">Phase</p>
                  <p className="mt-1 capitalize text-white/85">{quickStats.phase}</p>
                </div>
                <div className="rounded-lg border border-white/8 bg-brand-bg-dark/35 px-3 py-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/45">Progress</p>
                  <p className="mt-1 text-white/85">{quickStats.elapsed}</p>
                </div>
              </div>
              <Button variant="primary" fullWidth onClick={() => navigate(ROUTES.PRACTICE)}>Resume Session</Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">Done</p>
              <p className="mt-1 text-lg font-mono text-white/90">{progressSummary.completedCount}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">Latest</p>
              <p className="mt-1 text-lg font-mono text-white/90">{progressSummary.latestScore ?? '-'}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">Best</p>
              <p className="mt-1 text-lg font-mono text-white/90">{progressSummary.bestScore ?? '-'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-brand-bg-dark/35 p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">Latest Improvement Focus</p>
            {progressSummary.improvementAreas.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-brand-text-secondary/85">
                {progressSummary.improvementAreas.map(area => <li key={area}>- {area}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-brand-text-secondary/80">Complete one analyzed session to unlock targeted improvement notes.</p>
            )}
            {progressSummary.latestCase && <p className="mt-3 text-[10px] font-mono uppercase tracking-[0.16em] text-brand-accent/80 truncate">Last case: {progressSummary.latestCase}</p>}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-accent/80">Workspace</p>
            <h2 className="mt-1 text-2xl font-serif font-semibold text-brand-text-primary">Write and research between hearings</h2>
          </div>
          <Button variant="ghost" onClick={() => navigate(ROUTES.SETUP)} className="hidden sm:inline-flex border border-white/10">Configure Trial</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          <BentoItem
            title="Drafting Studio"
            description={draftingDescription}
            icon={<img src={draftingPen} alt="Drafting Pen" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
            buttonText="Enter Studio"
          />
          <BentoItem
            title="Case Library"
            description={`Explore ${modeDisplay.toLowerCase()} scenarios, then start a trial from a case you care about.`}
            icon={<img src={libraryBooks} alt="Case Library" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.LIBRARY)}
            buttonText="Browse Cases"
          />
          <BentoItem
            title="Bench & Counsel"
            description={`Review AI judges and opposing counsel for ${modeDisplay.toLowerCase()} practice.`}
            icon={<img src={judgeGavel} alt="Judge Gavel" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.BENCH)}
            buttonText="View Roster"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-accent/80">Advisors (optional)</p>
          <h2 className="mt-1 text-xl font-serif font-semibold text-brand-text-primary">Depth tools — after the practice loop</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          <BentoItem
            title="Strategy Room"
            description="Stress-test theory and run multi-agent debate before live exchange."
            icon={<img src={strategyAstrolabe} alt="Strategy Astrolabe" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.STRATEGY)}
            buttonText="Enter Strategy"
          />
          <BentoItem
            title="AI Personas"
            description="Consult domain experts when you need a fresh frame on a hard point."
            icon={<img src={personaSeal} alt="AI Personas" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.PERSONAS)}
            buttonText="Open Personas"
          />
          <BentoItem
            title="Deception Arena"
            description="Higher-pressure factual interrogation with the Dreadler engine."
            icon={<img src={deceptionKey} alt="Deception Arena" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
            onClick={() => navigate(ROUTES.DREADLER)}
            buttonText="Enter Arena"
          />
        </div>
      </section>
    </div>
  );
};

export default HomeScreen;
