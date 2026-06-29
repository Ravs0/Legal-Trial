import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, APP_NAME } from '../constants';
import { GavelMinimalIcon } from '../components/icons/GavelMinimalIcon';
import { GlobeMinimalIcon } from '../components/icons/GlobeMinimalIcon';
import courtroomLuxury from '../assets/courtroom_luxury.jpg';
import { BackgroundGeometry } from '../components/BackgroundGeometry';

const LandingScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) {
    throw new Error("TrialSimContext not found in LandingScreen");
  }
  const { setPracticeMode, setIsLoading } = context;

  const handleModeSelection = (mode: 'indian' | 'international') => {
    setIsLoading(true);
    setPracticeMode(mode);
    setTimeout(() => {
      setIsLoading(false);
      navigate(ROUTES.HOME);
    }, 100);
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg-primary text-brand-text-primary relative overflow-hidden noise-overlay">
      <BackgroundGeometry />
      {/* Background vignette of courtroom */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-[0.06] mix-blend-luminosity pointer-events-none" 
        style={{ backgroundImage: `url(${courtroomLuxury})` }}
      />

      {/* Decorative geometric elements */}
      <div className="absolute top-0 left-0 right-0 h-px bg-brand-accent/15" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-brand-accent/15" />
      <div className="absolute top-0 bottom-0 left-[8%] w-px bg-brand-text-primary/5 hidden lg:block" />
      <div className="absolute top-0 bottom-0 right-[8%] w-px bg-brand-text-primary/5 hidden lg:block" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-12 lg:px-24 py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border border-brand-accent/30 flex items-center justify-center">
            <div className="w-2 h-2 bg-brand-accent" />
          </div>
          <span className="text-[10px] font-mono text-brand-text-secondary tracking-[0.25em] uppercase">
            LexForge Legal Platform
          </span>
        </div>
        <span className="text-[10px] font-mono text-brand-text-secondary/50 tracking-widest hidden sm:block">
          v2.0
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 lg:px-24 relative z-10">

        {/* Hero typography */}
        <div className="text-center max-w-3xl mx-auto mb-12 lg:mb-16 animate-fadeInUp">
          <div className="inline-block mb-6">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-brand-accent/40" />
              <span className="text-[10px] font-mono text-brand-accent tracking-[0.3em] uppercase font-medium">
                Established 2026
              </span>
              <div className="h-px w-8 bg-brand-accent/40" />
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-8xl font-serif font-bold tracking-tight text-brand-text-primary leading-[0.95] mb-6">
            {APP_NAME}
          </h1>

          <div className="h-px w-24 bg-brand-accent/30 mx-auto mb-6" />

          <p className="text-base sm:text-lg text-brand-text-secondary font-light leading-relaxed max-w-xl mx-auto">
            Sharpen your legal skills with AI-driven mock trials, drafting practice,
            case research &amp; strategy — for Indian &amp; international law.
          </p>
        </div>

        {/* Jurisdiction selection cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-3xl mx-auto animate-fadeInUp" style={{ animationDelay: '0.15s' }}>

          {/* Indian Legal Practice */}
          <div
            onClick={() => handleModeSelection('indian')}
            className="group relative bg-brand-bg-secondary border border-brand-border rounded-2xl p-8 sm:p-10 cursor-pointer transition-all duration-400 ease-out shadow-sm
              hover:bg-brand-bg-primary hover:border-brand-accent/40 hover:shadow-card hover:-translate-y-1 focus-ring"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleModeSelection('indian'); } }}
          >
            <div className="flex flex-col h-full">
              <div className="w-12 h-12 border border-brand-border rounded-xl flex items-center justify-center mb-6 group-hover:border-brand-accent/40 group-hover:bg-brand-bg-secondary transition-all duration-300">
                <GavelMinimalIcon className="h-5 w-5 text-brand-accent" />
              </div>

              <span className="text-[9px] font-mono text-brand-accent tracking-[0.25em] uppercase mb-3 block">
                Jurisdiction I
              </span>

              <h3 className="text-xl sm:text-2xl font-serif font-semibold text-brand-text-primary mb-3 group-hover:text-brand-accent transition-colors duration-300">
                Indian Legal Practice
              </h3>

              <p className="text-xs sm:text-sm text-brand-text-secondary leading-relaxed font-light mb-8 flex-grow">
                Constitutional, criminal, and corporate laws of India. Practice advocacy under the CPC, IPC, BNSS, and Indian precedents.
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-brand-border">
                <span className="text-[10px] font-mono text-brand-text-secondary/60 tracking-wider group-hover:text-brand-accent/70 transition-colors">
                  Select to enter
                </span>
                <span className="text-brand-text-secondary/40 group-hover:text-brand-accent group-hover:translate-x-1 transition-all duration-300 text-lg">
                  &rarr;
                </span>
              </div>
            </div>
          </div>

          {/* International Law Practice */}
          <div
            onClick={() => handleModeSelection('international')}
            className="group relative bg-brand-bg-secondary border border-brand-border rounded-2xl p-8 sm:p-10 cursor-pointer transition-all duration-400 ease-out shadow-sm
              hover:bg-brand-bg-primary hover:border-brand-accent/40 hover:shadow-card hover:-translate-y-1 focus-ring"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleModeSelection('international'); } }}
          >
            <div className="flex flex-col h-full">
              <div className="w-12 h-12 border border-brand-border rounded-xl flex items-center justify-center mb-6 group-hover:border-brand-accent/40 group-hover:bg-brand-bg-secondary transition-all duration-300">
                <GlobeMinimalIcon className="h-5 w-5 text-brand-accent" />
              </div>

              <span className="text-[9px] font-mono text-brand-accent tracking-[0.25em] uppercase mb-3 block">
                Jurisdiction II
              </span>

              <h3 className="text-xl sm:text-2xl font-serif font-semibold text-brand-text-primary mb-3 group-hover:text-brand-accent transition-colors duration-300">
                International Law
              </h3>

              <p className="text-xs sm:text-sm text-brand-text-secondary leading-relaxed font-light mb-8 flex-grow">
                Public international law, humanitarian law, ICJ disputes, and conventions. Master cross-border arbitration and international covenants.
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-brand-border">
                <span className="text-[10px] font-mono text-brand-text-secondary/60 tracking-wider group-hover:text-brand-accent/70 transition-colors">
                  Select to enter
                </span>
                <span className="text-brand-text-secondary/40 group-hover:text-brand-accent group-hover:translate-x-1 transition-all duration-300 text-lg">
                  &rarr;
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Ecosystem section */}
      <section className="relative z-10 px-6 sm:px-12 lg:px-24 py-8 border-t border-brand-border/30 animate-fadeInUp" style={{ animationDelay: '0.4s' }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-[9px] font-mono text-brand-text-secondary/40 tracking-[0.3em] uppercase mb-5 text-center">
            LexForge Ecosystem
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <a
              href="https://asia-legal-dossier.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 text-brand-text-secondary/50 hover:text-brand-accent transition-colors duration-300"
            >
              <span className="w-1 h-1 rounded-full bg-brand-accent/40 group-hover:bg-brand-accent transition-colors" />
              <span className="text-[11px] font-mono tracking-wide">Asia Legal Dossier</span>
            </a>
            <a
              href="https://repo-ccp-learning.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 text-brand-text-secondary/50 hover:text-brand-accent transition-colors duration-300"
            >
              <span className="w-1 h-1 rounded-full bg-brand-accent/40 group-hover:bg-brand-accent transition-colors" />
              <span className="text-[11px] font-mono tracking-wide">CCP Learning</span>
            </a>
            <a
              href="https://what-cardinal-said.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 text-brand-text-secondary/50 hover:text-brand-accent transition-colors duration-300"
            >
              <span className="w-1 h-1 rounded-full bg-brand-accent/40 group-hover:bg-brand-accent transition-colors" />
              <span className="text-[11px] font-mono tracking-wide">What Cardinal Said</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between px-6 sm:px-12 lg:px-24 py-6">
        <span className="text-[10px] font-mono text-brand-text-secondary/40 tracking-wider">
          &copy; 2026 LexForge Technologies
        </span>
        <span className="text-[10px] font-mono text-brand-text-secondary/40 tracking-wider hidden sm:block">
          AI-Powered Legal Training
        </span>
      </footer>
    </div>
  );
};

export default LandingScreen;