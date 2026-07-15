import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, APP_NAME } from '../routes';
import { GavelMinimalIcon } from '../components/icons/GavelMinimalIcon';
import { GlobeMinimalIcon } from '../components/icons/GlobeMinimalIcon';
import { clearStoredLexForgeData, savePendingSettings } from '../services/storageService';
import { trackEvent } from '../services/analyticsService';
import heroCourtroom from '../assets/hero_courtroom.jpg';
import courtroomLuxury from '../assets/courtroom_luxury.jpg';

const LandingScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) {
    throw new Error('TrialSimContext not found in LandingScreen');
  }
  const { setPracticeMode, setIsLoading, setCurrentSessionSettings, setError } = context;
  const [dataCleared, setDataCleared] = useState(false);

  useEffect(() => {
    trackEvent('landing_viewed');
  }, []);

  const handleModeSelection = (mode: 'indian' | 'international') => {
    trackEvent('practice_mode_selected', { mode });
    setIsLoading(true);
    setPracticeMode(mode);
    setTimeout(() => {
      setIsLoading(false);
      navigate(ROUTES.HOME);
    }, 100);
  };

  const handleDemoStart = async () => {
    try {
      const { createDemoSessionSettings } = await import('../services/demoSessionService');
      const settings = createDemoSessionSettings();
      trackEvent('demo_trial_started', {
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

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-brand-bg-primary text-brand-text-primary">
      {/* Full-bleed photography */}
      <div className="absolute inset-0" aria-hidden>
        <img
          src={heroCourtroom}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary/75 to-brand-bg-primary/45" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg-primary/90 via-brand-bg-primary/50 to-brand-bg-primary/30" />
        {/* Structural hatch (same language as interior PhotoHero) */}
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
          <div className="w-7 h-7 rounded-md overflow-hidden border border-white/20">
            <img src={courtroomLuxury} alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-[15px] font-medium tracking-tight drop-shadow-sm">{APP_NAME}</span>
        </div>
        <button
          type="button"
          onClick={() => handleModeSelection('indian')}
          className="text-[13px] text-white/70 hover:text-white transition-colors py-2"
        >
          Open workspace
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col justify-end sm:justify-center px-5 sm:px-8 lg:px-12 pb-10 sm:pb-16 pt-8">
        <div className="max-w-6xl mx-auto w-full">
          <div className="max-w-xl">
            <p className="text-[12px] uppercase tracking-[0.16em] text-white/60 mb-4">
              Courtroom practice
            </p>
            <h1 className="text-[2.4rem] sm:text-[3rem] lg:text-[3.4rem] font-serif font-semibold leading-[1.08] tracking-tight text-white drop-shadow-md">
              Argue the case.
              <br />
              Get scored.
              <br />
              Come back sharper.
            </h1>
            <p className="mt-5 text-[15px] sm:text-base leading-relaxed text-white/75 max-w-md">
              Mock hearings against an AI judge and opposing counsel.
              Score, transcript, export. Tools when you need them.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                onClick={handleDemoStart}
                className="h-12 px-7 rounded-lg bg-white text-brand-bg-primary text-[14px] font-semibold hover:bg-white/95 transition-colors"
              >
                Start 15-minute demo
              </button>
              <p className="text-[12px] text-white/55 sm:pl-1">
                No setup. Beginner Indian case.
              </p>
            </div>
            <div className="mt-5 max-w-lg rounded-lg border border-white/15 bg-black/25 px-3.5 py-3 text-[11px] leading-relaxed text-white/65">
              <p><span className="font-medium text-white/85">Training only — not legal advice.</span> Do not enter confidential or client-identifying information. Trial transcripts and workspace data stay in this browser; AI requests are sent to the configured service for a response.</p>
              <button
                type="button"
                onClick={() => { clearStoredLexForgeData(); setDataCleared(true); }}
                className="mt-2 text-white/80 underline underline-offset-2 hover:text-white"
              >
                {dataCleared ? 'Local LexForge data cleared' : 'Clear saved local data'}
              </button>
            </div>
          </div>

          {/* Jurisdiction with photo tiles */}
          <div className="mt-12 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <button
              type="button"
              onClick={() => handleModeSelection('indian')}
              className="group relative h-36 sm:h-40 rounded-xl overflow-hidden border border-white/15 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <img
                src={courtroomLuxury}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-1.5">
                  <GavelMinimalIcon className="h-4 w-4 text-white/80" />
                  <span className="text-[11px] uppercase tracking-wide text-white/60">Jurisdiction</span>
                </div>
                <p className="text-lg font-serif font-semibold text-white">Indian practice</p>
                <p className="text-[12px] text-white/65 mt-0.5">CPC, BNSS, constitutional and commercial</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleModeSelection('international')}
              className="group relative h-36 sm:h-40 rounded-xl overflow-hidden border border-white/15 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <img
                src={heroCourtroom}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-1.5">
                  <GlobeMinimalIcon className="h-4 w-4 text-white/80" />
                  <span className="text-[11px] uppercase tracking-wide text-white/60">Jurisdiction</span>
                </div>
                <p className="text-lg font-serif font-semibold text-white">International</p>
                <p className="text-[12px] text-white/65 mt-0.5">Public IL, arbitration, treaty work</p>
              </div>
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-20 px-5 sm:px-8 lg:px-12 h-11 flex items-center justify-between border-t border-white/10 text-[12px] text-white/45">
        <span>{APP_NAME}</span>
        <span className="hidden sm:inline">Argue · Score · Review</span>
      </footer>
    </div>
  );
};

export default LandingScreen;
