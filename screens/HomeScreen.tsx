import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ROUTES, APP_NAME } from '../constants';
import { PlusCircleIcon } from '../components/icons/PlusCircleIcon';
import { TrialSimContext } from '../App';
import { loadActiveSession } from '../services/storageService';
import { SessionRecord } from '../types';
import strategyAstrolabe from '../assets/strategy_astrolabe.jpg';
import personaSeal from '../assets/persona_seal.jpg';
import deceptionKey from '../assets/deception_key.jpg';
import draftingPen from '../assets/drafting_pen.jpg';
import libraryBooks from '../assets/library_books.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';
import counselScales from '../assets/counsel_scales.jpg';
import heroCourtroom from '../assets/hero_courtroom.jpg';

interface BentoItemProps {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  buttonText?: string;
  className?: string;
  isHero?: boolean;
}

const BentoItem: React.FC<BentoItemProps> = ({ title, description, icon, onClick, buttonText, className = '', isHero = false }) => {
  const isImgIcon = React.isValidElement(icon) && icon.type === 'img';
  const imgElement = isImgIcon ? (icon as React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>) : null;
  const imgSrc = imgElement ? imgElement.props.src : null;

  return (
    <div
      className={`relative overflow-hidden flex flex-col rounded-2xl border transition-all duration-500 ease-out group
      ${onClick ? 'cursor-pointer focus-ring' : ''}
      ${onClick && !isHero ? 'hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:border-brand-accent/50' : ''}
      ${onClick && isHero ? 'hover:border-brand-accent/30 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]' : ''}
      ${isHero ? 'items-center text-center md:col-span-2 lg:col-span-3 justify-center py-10 sm:py-16 lg:py-20 bg-brand-bg-secondary border-brand-border shadow-sm' : 'bg-brand-bg-secondary border-brand-border'}
      ${className}`}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      role={onClick ? "button" : undefined}
    >
      {/* Background Image for Card */}
      {imgSrc && (
        <>
          <img 
            src={imgSrc} 
            alt={title} 
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-55 group-hover:opacity-75"
          />
          {/* Subtle gradient vignette to overlay readable text */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-dark/95 via-brand-bg-dark/85 to-brand-bg-dark/50" />
        </>
      )}

      {/* Actual Content Wrapper */}
      <div className={`relative z-10 w-full h-full flex-grow flex flex-col p-6 lg:p-8 ${isHero ? 'items-center justify-center text-center' : ''}`}>
        {icon && !isHero && !imgSrc && (
          <div className="w-12 h-12 rounded-xl bg-brand-bg-primary border border-brand-border flex items-center justify-center mb-5 transition-all duration-300 group-hover:border-brand-accent/30 group-hover:bg-brand-bg-secondary overflow-hidden">
            <div className="text-brand-accent">
              {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-5 w-5 lg:h-6 lg:w-6" })}
            </div>
          </div>
        )}

        {icon && isHero && !imgSrc && (
          <div className="relative z-10 w-20 h-20 rounded-2xl bg-brand-bg-secondary border border-brand-border flex items-center justify-center mb-6 transition-all duration-300 group-hover:border-brand-accent/30">
            <div className="text-brand-accent">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12" })}</div>
          </div>
        )}

        <h3 className={`font-serif mb-2 lg:mb-3 ${isHero ? 'text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight text-brand-text-primary' : 'text-base lg:text-xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300'}`}>{title}</h3>
        <div className={`font-light flex-grow leading-relaxed ${isHero ? 'text-sm sm:text-base lg:text-xl text-brand-text-secondary/90 max-w-3xl mx-auto mb-5 lg:mb-8' : 'text-xs lg:text-sm text-brand-text-secondary/85 mb-4 lg:mb-6 group-hover:text-brand-text-primary transition-colors duration-300'}`}>{description}</div>

        {buttonText && !isHero && (
          <div className="mt-auto w-full pt-4 border-t border-brand-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-2 text-brand-accent hover:text-brand-accent-hover transition-all bg-brand-bg-dark/40 backdrop-blur-sm border border-brand-border/20 rounded-xl py-1.5"
            >
              <span>[ {buttonText} ]</span>
              <span className="transform transition-transform group-hover:translate-x-1">→</span>
            </Button>
          </div>
        )}

        {buttonText && isHero && onClick && (
          <Button
            variant="primary"
            size="lg"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="mt-2 mx-auto px-6 lg:px-10 py-3 lg:py-4 text-sm lg:text-lg font-medium transition-transform duration-300"
          >
            <PlusCircleIcon className="h-5 w-5 lg:h-6 lg:w-6 mr-2 lg:mr-3 opacity-90" />
            {buttonText}
          </Button>
        )}
      </div>
    </div>
  );
};


const formatElapsed = (session: SessionRecord) => {
  const minutes = Math.max(0, Math.round(session.elapsedSeconds / 60));
  if (minutes <= 1) return 'just started';
  return `${minutes} min elapsed`;
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  const modeDisplay = practiceMode ? (practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)) : 'Selected';
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    const syncActiveSession = () => {
      setActiveSession(loadActiveSession());
    };

    syncActiveSession();
    window.addEventListener('focus', syncActiveSession);
    window.addEventListener('storage', syncActiveSession);
    return () => {
      window.removeEventListener('focus', syncActiveSession);
      window.removeEventListener('storage', syncActiveSession);
    };
  }, []);

  const draftingDescription = practiceMode === 'indian'
    ? 'Master Indian legal drafting: plaints, petitions, notices, procedural filings, and AI-guided feedback grounded in local practice.'
    : 'Refine international legal drafting: memorials, submissions, agreements, and strategy writing with tighter AI feedback.';

  const heroDescription = (
    <>
      Return to <span className="font-medium text-brand-text-primary">{APP_NAME}</span> with a cleaner path: start a new mock trial, continue your live session, or jump straight into drafting and strategy work.
    </>
  );

  const quickStats = useMemo(() => {
    if (!activeSession) return null;
    return {
      title: activeSession.settings.caseDetail.title,
      phase: activeSession.activePhase.replace('_', ' '),
      elapsed: formatElapsed(activeSession),
    };
  }, [activeSession]);

  return (
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-6 animate-fadeIn relative">
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-4 lg:gap-6">
        <div className="rounded-2xl border border-brand-border bg-brand-bg-secondary overflow-hidden relative min-h-[280px]">
          <img src={heroCourtroom} alt="Courtroom" className="absolute inset-0 w-full h-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-dark via-brand-bg-dark/88 to-brand-bg-dark/45" />
          <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-6 lg:p-8 gap-6">
            <div className="max-w-2xl">
              <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-brand-accent/90">{modeDisplay} Practice</p>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-brand-text-primary">Elevate Your {modeDisplay} Legal Skills</h1>
              <div className="mt-4 text-sm sm:text-base lg:text-lg text-brand-text-secondary/90 max-w-3xl leading-relaxed">{heroDescription}</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <Button variant="primary" size="lg" onClick={() => navigate(ROUTES.SETUP)} className="sm:min-w-[220px]">
                <PlusCircleIcon className="h-5 w-5 mr-2" />
                Start New Trial
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate(activeSession ? ROUTES.PRACTICE : ROUTES.DRAFTING_STUDIO)} className="sm:min-w-[220px]">
                {activeSession ? 'Resume Active Session' : 'Open Drafting Studio'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-bg-secondary p-5 sm:p-6 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-accent/80">Next Best Step</p>
            <h2 className="mt-2 text-xl font-serif font-semibold text-brand-text-primary">{activeSession ? 'Continue your live hearing' : 'Set up your next session'}</h2>
            <p className="mt-2 text-sm text-brand-text-secondary/80 leading-relaxed">
              {activeSession
                ? 'Your last courtroom session is still live in local storage. Continue from the transcript, phase, and score state you left behind.'
                : 'Pick a case, judge, counsel, and session length, then drop directly into the arena with a clearer mobile flow.'}
            </p>
          </div>

          {quickStats ? (
            <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/10 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-accent/85">Active Session</p>
                <h3 className="mt-1 text-sm font-semibold text-white/90 leading-snug">{quickStats.title}</h3>
              </div>
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
              <Button variant="primary" fullWidth onClick={() => navigate(ROUTES.PRACTICE)}>
                Resume Session
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/35 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">No Active Session</p>
                <p className="mt-1 text-sm text-brand-text-secondary/80">Start a fresh courtroom run or switch into a non-trial workspace.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => navigate(ROUTES.SETUP)}>Trial Setup</Button>
                <Button variant="ghost" onClick={() => navigate(ROUTES.STRATEGY)}>Strategy Room</Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">Mode</p>
              <p className="mt-1 text-xs text-white/85">{modeDisplay}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">Arena</p>
              <p className="mt-1 text-xs text-white/85">Live Practice</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-brand-bg-dark/30 px-3 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">AI</p>
              <p className="mt-1 text-xs text-white/85">DeepSeek</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        <BentoItem
          title="AI Personas"
          description="Consult domain experts, legal strategists, and specialized advisors when you need a fresh frame before entering the arena."
          icon={<img src={personaSeal} alt="AI Personas" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.PERSONAS)}
          buttonText="Open Personas"
          className="md:col-span-1"
        />

        <BentoItem
          title="AI Strategy Room"
          description="Stress-test your theory, run multi-agent debate, and pressure your argument before you step into live adversarial exchange."
          icon={<img src={strategyAstrolabe} alt="Strategy Astrolabe" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.STRATEGY)}
          buttonText="Enter Strategy"
          className="md:col-span-1"
        />

        <BentoItem
          title="Deception Arena"
          description="Interrogate witnesses and suspects with the Dreadler engine when you want a higher-pressure factual challenge than standard trial sparring."
          icon={<img src={deceptionKey} alt="Deception Arena" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.DREADLER)}
          buttonText="Enter Arena"
          className="md:col-span-1"
        />

        <BentoItem
          title="Drafting Practice Studio"
          description={draftingDescription}
          icon={<img src={draftingPen} alt="Drafting Pen" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
          buttonText="Enter Studio"
          className="md:col-span-1"
        />

        <BentoItem
          title="Case Library"
          description={`Explore legal scenarios and precedents inside the ${modeDisplay.toLowerCase()} framework before configuring your next session.`}
          icon={<img src={libraryBooks} alt="Case Library" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.LIBRARY)}
          buttonText="Browse Cases"
        />

        <BentoItem
          title="Meet the Judges"
          description={`Review AI judicial philosophies and likely questioning styles relevant to ${modeDisplay.toLowerCase()} practice.`}
          icon={<img src={judgeGavel} alt="Judge Gavel" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.JUDGES)}
          buttonText="View Judges"
        />

        <BentoItem
          title="Opposing Counsel"
          description={`Understand the tactical profiles and specialties of the counsel you will face in the ${modeDisplay.toLowerCase()} arena.`}
          icon={<img src={counselScales} alt="Opposing Counsel Scales" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
          onClick={() => navigate(ROUTES.OPPOSING_COUNSEL)}
          buttonText="View Counsel"
          className="md:col-span-1 lg:col-span-1"
        />
      </div>

      <div className="text-center pt-6 pb-4 relative">
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-brand-border"></div>
        <p className="text-xs lg:text-sm font-light tracking-wide text-brand-text-secondary/70 max-w-2xl mx-auto px-4">
          {APP_NAME} remains a rigorous training module for advocacy and drafting, but the front door is now tuned for faster re-entry, clearer next actions, and better mobile use.
        </p>
      </div>
    </div>
  );
};

export default HomeScreen;