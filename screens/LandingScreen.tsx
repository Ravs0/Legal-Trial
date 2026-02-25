import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, APP_NAME } from '../constants';
import { Button } from '../components/Button';
import { GavelMinimalIcon } from '../components/icons/GavelMinimalIcon';
import { GlobeMinimalIcon } from '../components/icons/GlobeMinimalIcon';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg-primary p-4 sm:p-8 overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[20%] left-[10%] w-[30rem] h-[30rem] bg-brand-accent/5 rounded-full blur-[120px] mix-blend-screen animate-pulse_ring"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[25rem] h-[25rem] bg-brand-navy-light/40 rounded-full blur-[100px] mix-blend-screen"></div>
      </div>

      <div className="z-10 text-center mb-16 sm:mb-20 animate-fadeInUp">
        <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-brand-accent/20 bg-brand-accent/5 backdrop-blur-md">
          <span className="text-xs font-mono text-brand-accent tracking-widest uppercase">The Pinnacle of Legal Simulation</span>
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold text-shimmer mb-6 font-serif tracking-tight drop-shadow-lg">
          {APP_NAME}
        </h1>
        <p className="text-xl sm:text-2xl text-brand-text-secondary max-w-3xl mx-auto font-light leading-relaxed">
          Hone your legal argumentation and drafting skills with AI-driven mock trials. Choose your arena.
        </p>
      </div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 w-full max-w-lg md:max-w-4xl px-4">
        {/* Indian Legal Practice Card */}
        <div
          onClick={() => handleModeSelection('indian')}
          className="glass-card gradient-border p-8 sm:p-12 rounded-3xl shadow-card hover:shadow-card-hover transition-all duration-300 ease-out cursor-pointer transform hover:-translate-y-2 focus-ring group animate-staggered-fade-in-item opacity-0 animation-delay-200"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('indian')}
        >
          <div className="flex flex-col items-center text-center h-full">
            <div className="w-20 h-20 rounded-2xl bg-brand-navy border border-brand-accent/20 flex items-center justify-center mb-6 shadow-inner-subtle group-hover:shadow-glow-gold-sm transition-shadow duration-300">
              <GavelMinimalIcon className="h-10 w-10 text-brand-accent drop-shadow-md" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300 mb-4 font-serif">Indian Legal Practice</h2>
            <p className="text-base sm:text-lg text-brand-text-secondary mb-8 font-light flex-grow">
              Engage with cases, judges, and advocates from the Indian legal system. Master constitutional, criminal, and corporate law.
            </p>
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-brand-accent/30 to-transparent mb-8"></div>
            <Button variant="primary" size="lg" className="w-full pointer-events-none group-hover:shadow-glow-gold transition-all duration-300" aria-hidden="true" tabIndex={-1}>
              Enter Indian Arena
            </Button>
          </div>
        </div>

        {/* International Law Practice Card */}
        <div
          onClick={() => handleModeSelection('international')}
          className="glass-card gradient-border p-8 sm:p-12 rounded-3xl shadow-card hover:shadow-card-hover transition-all duration-300 ease-out cursor-pointer transform hover:-translate-y-2 focus-ring group animate-staggered-fade-in-item opacity-0 animation-delay-400"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('international')}
        >
          <div className="flex flex-col items-center text-center h-full">
            <div className="w-20 h-20 rounded-2xl bg-brand-navy border border-brand-accent/20 flex items-center justify-center mb-6 shadow-inner-subtle group-hover:shadow-glow-gold-sm transition-shadow duration-300">
              <GlobeMinimalIcon className="h-10 w-10 text-brand-accent drop-shadow-md" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300 mb-4 font-serif">International Law Practice</h2>
            <p className="text-base sm:text-lg text-brand-text-secondary mb-8 font-light flex-grow">
              Tackle complex scenarios in public international law, human rights, and cross-border arbitration conventions.
            </p>
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-brand-accent/30 to-transparent mb-8"></div>
            <Button variant="primary" size="lg" className="w-full pointer-events-none group-hover:shadow-glow-gold transition-all duration-300" aria-hidden="true" tabIndex={-1}>
              Enter International Arena
            </Button>
          </div>
        </div>
      </div>

      <p className="z-10 text-sm font-mono text-brand-text-secondary/60 mt-20 text-center animate-fadeIn tracking-widest uppercase" style={{ animationDelay: '0.8s' }}>
        Select a practice mode to begin your journey in legal mastery.
      </p>
    </div>
  );
};

export default LandingScreen;