import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, APP_NAME } from '../constants';
import { Button } from '../components/Button';
import { GavelMinimalIcon } from '../components/icons/GavelMinimalIcon';
import { GlobeMinimalIcon } from '../components/icons/GlobeMinimalIcon';
import heroImage from '../assets/legal_hero_abstract.png';

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
    <div className="min-h-screen flex flex-col md:flex-row bg-brand-bg-primary text-brand-text-primary overflow-hidden relative noise-overlay">
      {/* Left Panel: Editorial Branding & Graphic (Desktop only) */}
      <div className="hidden md:flex md:w-[42%] bg-brand-bg-secondary border-r border-brand-border flex-col justify-between p-12 lg:p-16 relative">
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-none border border-brand-accent/20 bg-brand-bg-primary">
            <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase font-medium">System Active</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight font-serif text-brand-text-primary mt-4">
            {APP_NAME}
          </h1>
          <p className="text-sm text-brand-text-secondary font-mono tracking-wider uppercase">
            The Pinnacle of Legal Simulation
          </p>
        </div>

        <div className="my-auto py-8 flex items-center justify-center">
          <div className="relative group max-w-sm lg:max-w-md w-full">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-brand-accent to-brand-accent-hover opacity-20 blur-lg group-hover:opacity-30 transition duration-1000"></div>
            <img 
              src={heroImage} 
              alt="Legal Harmony Editorial Artwork" 
              className="relative rounded-none border border-brand-accent/30 shadow-[0_15px_40px_rgba(0,0,0,0.6)] w-full object-cover aspect-square"
            />
          </div>
        </div>

        <div className="text-[10px] font-mono text-brand-text-secondary/50 tracking-wider">
          © 2026 TrialSim Technologies. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Interactive Mode Selection */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:p-16 lg:p-24 relative">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="md:hidden text-center mb-12 animate-fadeInUp">
          <div className="inline-block mb-3 px-3 py-1 rounded-none border border-brand-accent/20 bg-brand-bg-secondary">
            <span className="text-[9px] font-mono text-brand-accent tracking-widest uppercase">The Pinnacle of Legal Simulation</span>
          </div>
          <h1 className="text-4xl font-bold text-brand-text-primary font-serif tracking-tight mb-2">
            {APP_NAME}
          </h1>
        </div>

        <div className="max-w-xl mx-auto w-full space-y-10 lg:space-y-12">
          <div className="text-center md:text-left space-y-4">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-brand-text-primary font-serif">
              Choose your practice arena
            </h2>
            <p className="text-sm sm:text-base text-brand-text-secondary font-light leading-relaxed">
              Hone your legal argumentation and drafting skills with AI-driven mock trials. Select a jurisdiction to begin.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 w-full">
            {/* Indian Legal Practice Card */}
            <div
              onClick={() => handleModeSelection('indian')}
              className="bg-brand-bg-secondary border border-brand-border hover:border-brand-accent/50 p-6 sm:p-8 rounded-none transition-all duration-300 ease-out cursor-pointer focus-ring group relative flex flex-col sm:flex-row gap-5 items-start sm:items-center hover:bg-brand-bg-tertiary/20"
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('indian')}
            >
              <div className="w-12 h-12 rounded-none bg-brand-bg-primary border border-brand-border flex items-center justify-center flex-shrink-0 group-hover:border-brand-accent/40 transition-colors">
                <GavelMinimalIcon className="h-6 w-6 text-brand-accent" />
              </div>
              <div className="flex-grow space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-brand-text-primary group-hover:text-brand-accent transition-colors font-serif">
                    Indian Legal Practice
                  </h3>
                  <span className="text-[10px] font-mono text-brand-text-secondary/60 group-hover:text-brand-accent transition-colors">
                    [ Enter ]
                  </span>
                </div>
                <p className="text-xs text-brand-text-secondary leading-relaxed font-light">
                  Constitutional, criminal, and corporate laws of India. Practice advocacy under the CPC, IPC, BNSS, and Indian precedents.
                </p>
              </div>
            </div>

            {/* International Law Practice Card */}
            <div
              onClick={() => handleModeSelection('international')}
              className="bg-brand-bg-secondary border border-brand-border hover:border-brand-accent/50 p-6 sm:p-8 rounded-none transition-all duration-300 ease-out cursor-pointer focus-ring group relative flex flex-col sm:flex-row gap-5 items-start sm:items-center hover:bg-brand-bg-tertiary/20"
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('international')}
            >
              <div className="w-12 h-12 rounded-none bg-brand-bg-primary border border-brand-border flex items-center justify-center flex-shrink-0 group-hover:border-brand-accent/40 transition-colors">
                <GlobeMinimalIcon className="h-6 w-6 text-brand-accent" />
              </div>
              <div className="flex-grow space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-brand-text-primary group-hover:text-brand-accent transition-colors font-serif">
                    International Law Practice
                  </h3>
                  <span className="text-[10px] font-mono text-brand-text-secondary/60 group-hover:text-brand-accent transition-colors">
                    [ Enter ]
                  </span>
                </div>
                <p className="text-xs text-brand-text-secondary leading-relaxed font-light">
                  Public international law, humanitarian law, ICJ disputes, and conventions. Master cross-border arbitration and international covenants.
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] font-mono text-brand-text-secondary/40 text-center md:text-left tracking-widest uppercase">
            Select a jurisdiction to activate simulator modules.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingScreen;