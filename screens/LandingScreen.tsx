import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, APP_NAME } from '../routes';
import { clearStoredLexForgeData, savePendingSettings } from '../services/storageService';
import { clearActiveSession, loadActiveSession } from '../services/storageService';
import { trackDemoTrialStarted, trackEvent } from '../services/analyticsService';
import { Modal } from '../components/Modal';
import { PhotoTile } from '../components/PhotoTile';
import { screenMedia } from '../assets';
import type { SessionRecord } from '../types';

const LOOP_STEPS = [
  { label: 'Argue', hint: 'AI judge + counsel' },
  { label: 'Score', hint: 'Rubric after the run' },
  { label: 'Review', hint: 'Transcript + export' },
] as const;

const LandingScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) {
    throw new Error('TrialSimContext not found in LandingScreen');
  }
  const { setPracticeMode, setIsLoading, setCurrentSessionSettings, setError } = context;
  const [dataCleared, setDataCleared] = useState(false);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    trackEvent('landing_viewed');
    setActiveSession(loadActiveSession());
  }, []);

  const activeCaseTitle = useMemo(
    () => activeSession?.settings?.caseDetail?.title ?? null,
    [activeSession],
  );

  const openModes = (source: 'header' | 'inline') => {
    setShowModes((prev) => {
      const next = source === 'header' ? true : !prev;
      if (next && !prev) {
        trackEvent('landing_modes_opened', { source });
      }
      return next;
    });
  };

  const handleModeSelection = (mode: 'indian' | 'international') => {
    trackEvent('practice_mode_selected', { mode, source: 'landing' });
    setIsLoading(true);
    setPracticeMode(mode);
    setTimeout(() => {
      setIsLoading(false);
      navigate(ROUTES.HOME);
    }, 100);
  };

  const startDemo = async (replaceActiveSession = false) => {
    try {
      if (replaceActiveSession) clearActiveSession();
      const { createDemoSessionSettings } = await import('../services/demoSessionService');
      const settings = createDemoSessionSettings();
      trackDemoTrialStarted({
        source: 'landing',
        mode: settings.practiceMode,
        caseId: settings.caseDetail.id,
        caseTitle: settings.caseDetail.title,
        replacedActiveSession: replaceActiveSession,
      });
      setPracticeMode(settings.practiceMode);
      setCurrentSessionSettings(settings);
      savePendingSettings(settings);
      navigate(ROUTES.PRACTICE);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start demo trial.');
    }
  };

  const handleDemoStart = () => {
    if (loadActiveSession()) {
      setShowDemoConfirm(true);
      return;
    }
    void startDemo();
  };

  const handleClearLocal = () => {
    clearStoredLexForgeData();
    setDataCleared(true);
    setActiveSession(null);
    trackEvent('landing_local_data_cleared');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-brand-bg-primary text-brand-text-primary">
      {/* Full-bleed: court corridor night (entry motif; monochrome hatch language) */}
      <div className="absolute inset-0" aria-hidden>
        <img
          src={screenMedia.landing.hero}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary/80 to-brand-bg-primary/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg-primary/92 via-brand-bg-primary/55 to-brand-bg-primary/35" />
        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, transparent, transparent 14px, rgba(255,255,255,0.05) 14px, rgba(255,255,255,0.05) 15px)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 sm:px-8 lg:px-12 h-14 sm:h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md overflow-hidden border border-brand-border">
            <img src={screenMedia.landing.logo} alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-[15px] font-medium tracking-tight">{APP_NAME}</span>
        </div>
        <button
          type="button"
          onClick={() => openModes('header')}
          className="text-[13px] text-brand-text-primary/70 hover:text-brand-text-primary transition-colors py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/30 rounded-sm"
        >
          Open workspace
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col justify-end sm:justify-center px-5 sm:px-8 lg:px-12 pb-10 sm:pb-16 pt-8">
        <div className="max-w-6xl mx-auto w-full">
          {/* Recovery path: active hearing beats cold start */}
          {activeSession && (
            <div className="mb-6 max-w-xl rounded-md border border-brand-border bg-brand-bg-secondary/85 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-brand-text-primary/50">Hearing in progress</p>
                <p className="mt-1 text-[13px] text-brand-text-primary/90 truncate">
                  {activeCaseTitle || 'Unsaved local session'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  trackEvent('landing_resume_clicked');
                  navigate(ROUTES.PRACTICE);
                }}
                className="shrink-0 h-10 px-4 rounded-md border border-brand-border-light bg-[#1c1914]/[0.06] text-[13px] font-medium text-brand-text-primary hover:bg-[#1c1914]/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/30"
              >
                Resume hearing
              </button>
            </div>
          )}

          {/* Core conversion: one primary decision */}
          <div className="max-w-xl">
            <p className="text-[12px] uppercase tracking-[0.16em] text-brand-text-primary/60 mb-4">
              Courtroom practice
            </p>
            <h1 className="text-[2.35rem] sm:text-[3rem] lg:text-[3.35rem] font-serif font-semibold leading-[1.08] tracking-tight text-brand-text-primary">
              Argue the case.
              <br />
              Get scored.
              <br />
              Come back sharper.
            </h1>
            <p className="mt-5 text-[15px] sm:text-base leading-relaxed text-brand-text-primary/75 max-w-md">
              Mock hearings against an AI judge and opposing counsel.
              Score, transcript, export. Tools when you need them.
            </p>

            {/* Compact loop proof (conversion, not Labs) */}
            <ol className="mt-6 flex flex-wrap gap-2" aria-label="Practice loop">
              {LOOP_STEPS.map((step, index) => (
                <li
                  key={step.label}
                  className="inline-flex items-center gap-2 rounded-md border border-brand-border bg-brand-bg-secondary/85 px-2.5 py-1.5"
                >
                  <span className="text-[10px] tabular-nums text-brand-text-primary/40 w-3">{index + 1}</span>
                  <span className="text-[12px] font-medium text-brand-text-primary/90">{step.label}</span>
                  <span className="hidden sm:inline text-[11px] text-brand-text-primary/45">{step.hint}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                onClick={handleDemoStart}
                className="h-12 px-7 rounded-md bg-brand-text-primary text-brand-bg-primary text-[14px] font-semibold hover:bg-[#3a352c] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg-primary"
              >
                Start 15-minute demo
              </button>
              <p className="text-[12px] text-brand-text-primary/55 sm:pl-1">
                No setup. Beginner Indian case.
              </p>
            </div>

            {/* Layer 1: jurisdiction after primary CTA */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => openModes('inline')}
                className="text-[13px] text-brand-text-primary/70 hover:text-brand-text-primary underline underline-offset-4 decoration-[#1c1914]/25 hover:decoration-[#1c1914]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/30 rounded-sm"
                aria-expanded={showModes}
              >
                {showModes ? 'Hide jurisdiction options' : 'Or choose a jurisdiction'}
              </button>
            </div>
          </div>

          {showModes && (
            <div className="mt-8 sm:mt-10 max-w-2xl" id="landing-modes">
              <p className="text-[11px] uppercase tracking-[0.14em] text-brand-text-primary/50 mb-3">
                Choose workspace mode
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#1c1914]/[0.06] rounded-md overflow-hidden border border-brand-border">
                <PhotoTile
                  title="Indian practice"
                  description="CPC, BNSS, constitutional and commercial"
                  image={screenMedia.landing.indian}
                  badge="Jurisdiction"
                  onClick={() => handleModeSelection('indian')}
                  className="min-h-[144px] sm:min-h-[160px] !rounded-none !border-0"
                />
                <PhotoTile
                  title="International"
                  description="Public IL, arbitration, treaty work"
                  image={screenMedia.landing.international}
                  badge="Jurisdiction"
                  onClick={() => handleModeSelection('international')}
                  className="min-h-[144px] sm:min-h-[160px] !rounded-none !border-0"
                />
              </div>
              <p className="mt-3 text-[12px] text-brand-text-primary/45 max-w-lg">
                Mode picks the catalog, bench, and tools.
              </p>
            </div>
          )}

          {/* Layer 2: trust / privacy last (progressive disclosure) */}
          <div className="mt-8 max-w-xl">
            <button
              type="button"
              onClick={() => {
                setShowTrust((v) => {
                  const next = !v;
                  if (next) trackEvent('landing_trust_opened');
                  return next;
                });
              }}
              className="text-[12px] text-brand-text-primary/50 hover:text-brand-text-primary/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/25 rounded-sm"
              aria-expanded={showTrust}
            >
              {showTrust ? 'Hide training notice' : 'Training only. Not legal advice.'}
            </button>
            {showTrust && (
              <div className="mt-3 rounded-md border border-brand-border bg-brand-bg-secondary/85 px-3.5 py-3 text-[11px] leading-relaxed text-white/65">
                <p>
                  <span className="font-medium text-brand-text-primary/85">Training only. Not legal advice.</span>{' '}
                  Do not enter confidential or client-identifying information. Trial transcripts and
                  workspace data stay in this browser; AI requests are sent to the configured service
                  for a response.
                </p>
                <button
                  type="button"
                  onClick={handleClearLocal}
                  className="mt-2 text-brand-text-primary/80 underline underline-offset-2 hover:text-brand-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/25 rounded-sm"
                >
                  {dataCleared ? 'Local LexForge data cleared' : 'Clear saved local data'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-20 px-5 sm:px-8 lg:px-12 h-11 flex items-center justify-between border-t border-brand-border text-[12px] text-brand-text-primary/45">
        <span>{APP_NAME}</span>
        <span className="hidden sm:inline">Argue · Score · Review</span>
      </footer>

      <Modal isOpen={showDemoConfirm} onClose={() => setShowDemoConfirm(false)} title="Resume or start a demo?" size="sm">
        <p className="text-sm leading-relaxed text-brand-text-secondary">
          You have a hearing in progress. Starting the demo will replace that local active session.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PRACTICE)}
            className="min-h-11 rounded-md border border-brand-border px-4 text-sm font-medium text-brand-text-primary hover:bg-brand-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/25"
          >
            Resume hearing
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDemoConfirm(false);
              void startDemo(true);
            }}
            className="min-h-11 rounded-md bg-brand-accent px-4 text-sm font-semibold text-brand-bg-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/30"
          >
            Start fresh demo
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default LandingScreen;
