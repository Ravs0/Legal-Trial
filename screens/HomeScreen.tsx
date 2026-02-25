import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ROUTES, APP_NAME } from '../constants';
import { CourtIcon } from '../components/icons/CourtIcon';
import { DocumentTextIcon } from '../components/icons/DocumentTextIcon';
import { GavelIcon } from '../components/icons/GavelIcon';
import { UsersIcon } from '../components/icons/UsersIcon';
import { PlusCircleIcon } from '../components/icons/PlusCircleIcon';
import { QuillIcon } from '../components/icons/QuillIcon';
import { TrialSimContext } from '../App';

interface BentoItemProps {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  buttonText?: string;
  className?: string;
  isHero?: boolean;
}

const BentoItem: React.FC<BentoItemProps> = ({ title, description, icon, onClick, buttonText, className = '', isHero = false }) => (
  <div
    className={`glass-card gradient-border flex flex-col rounded-3xl p-6 sm:p-8 transition-all duration-300 ease-out group 
    ${onClick && !isHero ? 'cursor-pointer hover:-translate-y-1 hover:shadow-card-hover focus-ring' : ''}
    ${isHero ? 'items-center text-center md:col-span-2 lg:col-span-3 justify-center py-12 sm:py-16 shadow-card hover:shadow-card-hover relative overflow-hidden' : 'shadow-card'}
    ${className}`}
    onClick={!isHero && onClick ? onClick : undefined}
    tabIndex={onClick && !isHero ? 0 : undefined}
    onKeyPress={(e) => { if (onClick && !isHero && e.key === 'Enter') onClick(); }}
    role={onClick && !isHero ? "button" : undefined}
  >
    {isHero && (
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[40%] h-[150%] bg-gradient-to-l from-brand-accent/5 to-transparent skew-x-12 translate-x-1/4"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[30%] h-[80%] bg-brand-accent/5 rounded-full blur-[60px] mix-blend-screen animate-pulse_ring"></div>
      </div>
    )}

    {icon && !isHero && (
      <div className="w-12 h-12 rounded-xl bg-brand-navy border border-brand-accent/20 flex items-center justify-center mb-5 shadow-inner-subtle group-hover:shadow-glow-gold-sm transition-shadow duration-300">
        <div className="text-brand-accent">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-6 w-6 drop-shadow-md" })}</div>
      </div>
    )}

    {icon && isHero && (
      <div className="relative z-10 w-24 h-24 rounded-2xl bg-brand-navy/80 backdrop-blur-md border border-brand-accent/30 flex items-center justify-center mb-8 shadow-glow-gold">
        <div className="absolute inset-0 bg-brand-accent/10 rounded-inherit animate-pulse_ring pointer-events-none"></div>
        <div className="text-brand-accent">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-12 w-12 drop-shadow-lg" })}</div>
      </div>
    )}

    <div className="relative z-10 w-full flex-grow flex flex-col">
      <h3 className={`font-serif mb-3 ${isHero ? 'text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-shimmer drop-shadow-lg' : 'text-xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors'}`}>{title}</h3>
      <div className={`font-light flex-grow leading-relaxed ${isHero ? 'text-lg sm:text-xl text-brand-text-secondary/90 max-w-3xl mx-auto mb-8' : 'text-sm text-brand-text-secondary mb-6'}`}>{description}</div>

      {buttonText && !isHero && (
        <div className="mt-auto w-full pt-4 border-t border-brand-accent/10">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2 text-brand-accent hover:text-brand-accent-hover group-hover:shadow-glow-gold-sm transition-all"
          >
            <span>{buttonText}</span>
            <span className="transform transition-transform group-hover:translate-x-1">→</span>
          </Button>
        </div>
      )}

      {buttonText && isHero && onClick && (
        <Button
          variant="primary"
          size="lg"
          onClick={onClick}
          className="mt-2 mx-auto px-10 py-4 text-lg font-medium shadow-glow-gold hover:scale-105 transition-transform duration-300"
        >
          <PlusCircleIcon className="h-6 w-6 mr-3 opacity-90" />
          {buttonText}
        </Button>
      )}
    </div>
  </div>
);


const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  const modeDisplay = practiceMode ? (practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)) : 'Selected';

  const draftingDescription = practiceMode === 'indian'
    ? `Master Indian legal drafting: plaints, petitions, notices (CPC, new Criminal Laws like BNSS II, Contract Act). AI-guided feedback & procedural nuances.`
    : `Refine international legal drafting: submissions, memorials, agreements (treaties, arbitration, human rights). AI feedback & best practices.`;

  const heroDescription = (
    <>
      Welcome to <span className="font-medium text-brand-text-primary">{APP_NAME}</span>.
      Sharpen advocacy in <strong className="font-medium text-brand-text-primary">Mock Trials</strong>.
      Master legal writing in the <strong className="font-medium text-brand-text-primary">Drafting Studio</strong>.
      Your {modeDisplay.toLowerCase()} law skills journey starts here.
    </>
  );

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        <BentoItem
          isHero
          title={`Elevate Your ${modeDisplay} Legal Skills`}
          description={heroDescription}
          icon={<CourtIcon />}
          onClick={() => navigate(ROUTES.SETUP)}
          buttonText={`Start New ${modeDisplay} Trial Session`}
          className="min-h-[400px]"
        />

        <BentoItem
          title="Drafting Practice Studio"
          description={draftingDescription}
          icon={<QuillIcon />}
          onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
          buttonText="Enter Studio"
          className="lg:col-span-1 md:col-span-2 bg-gradient-to-br from-brand-navy/60 to-brand-navy-light/40"
        />

        <BentoItem
          title="Case Library"
          description={`Explore diverse legal scenarios and precedents within the ${modeDisplay.toLowerCase()} framework to prepare for rigorous mock trials.`}
          icon={<DocumentTextIcon />}
          onClick={() => navigate(ROUTES.LIBRARY)}
          buttonText="Browse Cases"
        />

        <BentoItem
          title="Meet the Judges"
          description={`Familiarize yourself with AI Judge personalities, their judicial philosophies, and expectations relevant to ${modeDisplay.toLowerCase()} practice.`}
          icon={<GavelIcon />}
          onClick={() => navigate(ROUTES.JUDGES)}
          buttonText="View Judges"
        />

        <BentoItem
          title="Opposing Counsel"
          description={`Analyze the specialized AI Opposing Counsel you'll face in the ${modeDisplay.toLowerCase()} arena. Understand their tactical approaches.`}
          icon={<UsersIcon />}
          onClick={() => navigate(ROUTES.OPPOSING_COUNSEL)}
          buttonText="View Counsel"
          className="md:col-span-1 lg:col-span-1"
        />
      </div>

      <div className="text-center pt-10 pb-4 relative">
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-brand-accent/20 to-transparent"></div>
        <p className="text-sm font-light tracking-wide text-brand-text-secondary/70 max-w-2xl mx-auto">
          {APP_NAME} is a rigorous training module designed to critically assess and dramatically improve your legal argumentation and drafting dexterity within the {modeDisplay.toLowerCase()} context.
        </p>
      </div>
    </div>
  );
};

export default HomeScreen;