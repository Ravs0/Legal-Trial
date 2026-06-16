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
    className={`bg-brand-bg-primary border border-brand-text-primary/30 flex flex-col rounded-none p-4 sm:p-6 lg:p-8 transition-all duration-300 ease-out group 
    ${onClick && !isHero ? 'cursor-pointer hover:bg-brand-bg-secondary focus-ring' : ''}
    ${isHero ? 'items-center text-center md:col-span-2 lg:col-span-3 justify-center py-8 sm:py-12 lg:py-16 relative overflow-hidden' : ''}
    ${className}`}
    onClick={!isHero && onClick ? onClick : undefined}
    tabIndex={onClick && !isHero ? 0 : undefined}
    onKeyPress={(e) => { if (onClick && !isHero && e.key === 'Enter') onClick(); }}
    role={onClick && !isHero ? "button" : undefined}
  >
    {icon && !isHero && (
      <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center mb-4 lg:mb-5">
        <div className="text-brand-accent">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-5 w-5 lg:h-6 lg:w-6" })}</div>
      </div>
    )}

    {icon && isHero && (
      <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center mb-5 lg:mb-8">
        <div className="text-brand-accent">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12" })}</div>
      </div>
    )}

    <div className="relative z-10 w-full flex-grow flex flex-col">
      <h3 className={`font-serif mb-2 lg:mb-3 ${isHero ? 'text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight text-brand-text-primary' : 'text-base lg:text-xl font-semibold text-brand-text-primary group-hover:text-brand-accent transition-colors'}`}>{title}</h3>
      <div className={`font-light flex-grow leading-relaxed ${isHero ? 'text-sm sm:text-base lg:text-xl text-brand-text-secondary/90 max-w-3xl mx-auto mb-5 lg:mb-8' : 'text-xs lg:text-sm text-brand-text-secondary mb-4 lg:mb-6'}`}>{description}</div>

      {buttonText && !isHero && (
        <div className="mt-auto w-full pt-4 border-t border-brand-text-primary/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2 text-brand-accent hover:text-brand-accent-hover transition-all"
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
          onClick={onClick}
          className="mt-2 mx-auto px-6 lg:px-10 py-3 lg:py-4 text-sm lg:text-lg font-medium transition-transform duration-300"
        >
          <PlusCircleIcon className="h-5 w-5 lg:h-6 lg:w-6 mr-2 lg:mr-3 opacity-90" />
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
    <div className="space-y-0 animate-fadeIn max-w-7xl mx-auto relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
        <BentoItem
          isHero
          title={`Elevate Your ${modeDisplay} Legal Skills`}
          description={heroDescription}
          icon={<CourtIcon />}
          onClick={() => navigate(ROUTES.SETUP)}
          buttonText={`Start New ${modeDisplay} Trial Session`}
          className="min-h-[280px] lg:min-h-[400px]"
        />

        <BentoItem
          title="Drafting Practice Studio"
          description={draftingDescription}
          icon={<QuillIcon />}
          onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
          buttonText="Enter Studio"
          className="lg:col-span-1 md:col-span-2 bg-brand-bg-primary"
        />

        <BentoItem
          title="Sentient Subjects"
          description="The law has awakened. Five legal subjects have gained sentience — Constitutional, Criminal, Corporate, Family, and International. They are not teachers. They ARE the law. Commune with them."
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
          }
          onClick={() => navigate(ROUTES.SENTIENT_SUBJECTS)}
          buttonText="Awaken"
          className="md:col-span-2 lg:col-span-1"
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
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-brand-text-primary/30"></div>
        <p className="text-xs lg:text-sm font-light tracking-wide text-brand-text-secondary/70 max-w-2xl mx-auto px-4">
          {APP_NAME} is a rigorous training module designed to critically assess and dramatically improve your legal argumentation and drafting dexterity within the {modeDisplay.toLowerCase()} context.
        </p>
      </div>
    </div>
  );
};

export default HomeScreen;