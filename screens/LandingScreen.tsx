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
      <div className="z-10 text-center mb-16 sm:mb-20 animate-fadeInUp">
        <div className="inline-block mb-4 px-4 py-1.5 rounded-none border border-brand-text-primary/30 bg-brand-bg-secondary">
          <span className="text-xs font-mono text-brand-text-primary tracking-widest uppercase">The Pinnacle of Legal Simulation</span>
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold text-brand-text-primary mb-6 font-serif tracking-tight">
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
          className="bg-brand-bg-primary border border-brand-text-primary/30 p-8 sm:p-12 rounded-none transition-all duration-300 ease-out cursor-pointer focus-ring group animate-staggered-fade-in-item opacity-0 animation-delay-200"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('indian')}
        >
          <div className="flex flex-col items-center text-center h-full">
            <div className="w-20 h-20 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center mb-6">
              <GavelMinimalIcon className="h-10 w-10 text-brand-accent" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300 mb-4 font-serif">Indian Legal Practice</h2>
            <p className="text-base sm:text-lg text-brand-text-secondary mb-8 font-light flex-grow">
              Engage with cases, judges, and advocates from the Indian legal system. Master constitutional, criminal, and corporate law.
            </p>
            <div className="w-full h-[1px] bg-brand-text-primary/30 mb-8"></div>
            <Button variant="primary" size="lg" className="w-full pointer-events-none transition-all duration-300" aria-hidden="true" tabIndex={-1}>
              Enter Indian Arena
            </Button>
          </div>
        </div>

        {/* International Law Practice Card */}
        <div
          onClick={() => handleModeSelection('international')}
          className="bg-brand-bg-primary border border-brand-text-primary/30 p-8 sm:p-12 rounded-none transition-all duration-300 ease-out cursor-pointer focus-ring group animate-staggered-fade-in-item opacity-0 animation-delay-400"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('international')}
        >
          <div className="flex flex-col items-center text-center h-full">
            <div className="w-20 h-20 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center mb-6">
              <GlobeMinimalIcon className="h-10 w-10 text-brand-accent" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors duration-300 mb-4 font-serif">International Law Practice</h2>
            <p className="text-base sm:text-lg text-brand-text-secondary mb-8 font-light flex-grow">
              Tackle complex scenarios in public international law, human rights, and cross-border arbitration conventions.
            </p>
            <div className="w-full h-[1px] bg-brand-text-primary/30 mb-8"></div>
            <Button variant="primary" size="lg" className="w-full pointer-events-none transition-all duration-300" aria-hidden="true" tabIndex={-1}>
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