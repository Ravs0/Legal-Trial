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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg-primary p-4 sm:p-8 overflow-hidden">
      <div className="text-center mb-12 sm:mb-16 animate-fadeIn">
        {/* Title gradient updated to new red-based gradient */}
        <h1 className="text-5xl sm:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to mb-3 sm:mb-4 font-serif tracking-tight animate-fadeIn" style={{animationDelay: '0.1s'}}>{APP_NAME}</h1> 
        <p className="text-xl sm:text-2xl text-brand-text-secondary max-w-3xl mx-auto animate-fadeIn" style={{animationDelay: '0.3s'}}>
          Hone your legal argumentation and drafting skills with AI-driven mock trials. Choose your arena.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 w-full max-w-sm md:max-w-2xl lg:max-w-3xl">
        <div 
          onClick={() => handleModeSelection('indian')}
          // Neumorphic card styling with hover/active states
          className="bg-brand-bg-primary p-6 sm:p-10 rounded-3xl shadow-neumorphic-raised hover:shadow-neumorphic-flat active:shadow-neumorphic-pressed transition-all duration-200 ease-in-out cursor-pointer transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-bg-primary animate-staggered-fade-in-item opacity-0 animation-delay-200"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('indian')}
        >
          <div className="flex flex-col items-center text-center">
            {/* Icon color is new red brand-accent */}
            <GavelMinimalIcon className="h-12 w-12 sm:h-16 sm:w-16 text-brand-accent mb-5" /> 
            {/* Title color is new red brand-accent */}
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-accent mb-2 font-serif">Indian Legal Practice</h2> 
            <p className="text-sm sm:text-base text-brand-text-secondary mb-6">
              Engage with cases, judges, and advocates from the Indian legal system.
            </p>
            {/* Button inherits new primary (red) style */}
            <Button variant="primary" size="md" className="w-full sm:w-auto pointer-events-none" aria-hidden="true" tabIndex={-1}> 
              Enter Indian Arena
            </Button>
          </div>
        </div>

        <div 
          onClick={() => handleModeSelection('international')}
          // Neumorphic card styling with hover/active states
          className="bg-brand-bg-primary p-6 sm:p-10 rounded-3xl shadow-neumorphic-raised hover:shadow-neumorphic-flat active:shadow-neumorphic-pressed transition-all duration-200 ease-in-out cursor-pointer transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-bg-primary animate-staggered-fade-in-item opacity-0 animation-delay-400"
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && handleModeSelection('international')}
        >
          <div className="flex flex-col items-center text-center">
            {/* Icon color is new red brand-accent */}
            <GlobeMinimalIcon className="h-12 w-12 sm:h-16 sm:w-16 text-brand-accent mb-5" /> 
            {/* Title color is new red brand-accent */}
            <h2 className="text-2xl sm:text-3xl font-semibold text-brand-accent mb-2 font-serif">International Law Practice</h2> 
            <p className="text-sm sm:text-base text-brand-text-secondary mb-6">
              Tackle scenarios in public international law, human rights, and arbitration.
            </p>
             {/* Button inherits new primary (red) style */}
            <Button variant="primary" size="md" className="w-full sm:w-auto pointer-events-none" aria-hidden="true" tabIndex={-1}>
              Enter International Arena
            </Button>
          </div>
        </div>
      </div>
       <p className="text-xs sm:text-sm text-brand-text-secondary mt-16 sm:mt-20 text-center animate-fadeIn" style={{animationDelay: '0.8s'}}>
        Select a practice mode to begin your journey in legal mastery.
      </p>
    </div>
  );
};

export default LandingScreen;