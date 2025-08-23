import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
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
  useHeroGradient?: boolean; // Specific prop to apply red gradient for hero
}

const BentoItem: React.FC<BentoItemProps> = ({ title, description, icon, onClick, buttonText, className = '', isHero = false, useHeroGradient = false }) => (
  <Card 
    // All cards are now standard neumorphic. Hero applies gradient via useHeroGradient.
    className={`flex flex-col ${isHero ? 'items-center text-center md:col-span-2 lg:col-span-3 justify-center' : ''} ${useHeroGradient ? 'bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-brand-accent-text' : 'bg-brand-bg-primary'} ${className}`}
    onClick={!isHero && onClick ? onClick : undefined}
    hoverEffect={!isHero} 
  >
    {/* Icon styling: red for standard cards, white on gradient for hero */}
    {icon && !isHero && <div className="text-brand-accent mb-3 self-start">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-10 w-10" })}</div>}
    {icon && isHero && <div className={`p-1 ${useHeroGradient ? 'text-brand-accent-text' : 'text-brand-accent'} mb-5`}>{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-24 w-24" })}</div>}
    
    {/* Title styling: red for standard cards, white on gradient for hero */}
    <h3 className={`font-serif mb-2 ${isHero ? 'text-4xl sm:text-5xl font-bold' : 'text-xl font-semibold'} ${useHeroGradient ? 'text-brand-accent-text' : 'text-brand-accent'}`}>{title}</h3>
    {/* Description styling: secondary text for standard, lighter red/white for hero on gradient */}
    <div className={`text-sm mb-4 flex-grow ${isHero ? 'text-lg max-w-3xl mx-auto' : ''} ${useHeroGradient ? 'text-red-100 opacity-90' : 'text-brand-text-secondary'}`}>{description}</div>
    
    {buttonText && !isHero && (
      <Button 
        variant="secondary" // Uses red text on hover
        size="sm" 
        onClick={onClick} 
        className="mt-auto w-full" 
      >
        {buttonText}
      </Button>
    )}
     {buttonText && isHero && onClick && (
        <Button 
            variant="primary" // Primary uses solid red background
            size="lg" 
            onClick={onClick} 
            className="mt-6 px-10 py-3.5 text-lg"
          >
            <PlusCircleIcon className="h-6 w-6 mr-2.5" />
            {buttonText}
        </Button>
     )}
  </Card>
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
      Welcome to <span className="font-semibold opacity-90">{APP_NAME}</span>. {/* Removed text-red-300 for white text on red gradient */}
      Sharpen advocacy in <strong className="font-medium opacity-95">Mock Trials</strong>. 
      Master legal writing in the <strong className="font-medium opacity-95">Drafting Studio</strong>. 
      Your {modeDisplay.toLowerCase()} law skills journey starts here.
    </>
  );


  return (
    <div className="space-y-6 lg:space-y-8 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <BentoItem
          isHero
          useHeroGradient // Apply red gradient to hero
          title={`Elevate Your ${modeDisplay} Legal Skills`}
          description={heroDescription}
          icon={<CourtIcon />}
          onClick={() => navigate(ROUTES.SETUP)}
          buttonText={`Start New ${modeDisplay} Trial Session`}
          className="min-h-[320px] md:min-h-[360px]"
        />

        <BentoItem
          title="Drafting Practice Studio"
          description={draftingDescription}
          icon={<QuillIcon />}
          onClick={() => navigate(ROUTES.DRAFTING_STUDIO)}
          buttonText="Enter Studio"
          className="lg:col-span-1 md:col-span-2" 
        />

        <BentoItem
          title="Case Library"
          description={`Explore diverse legal scenarios and precedents within the ${modeDisplay.toLowerCase()} framework to prepare for mock trials.`}
          icon={<DocumentTextIcon />}
          onClick={() => navigate(ROUTES.LIBRARY)}
          buttonText="Browse Cases"
        />
        
        <BentoItem
          title="Meet the Judges"
          description={`Familiarize yourself with AI Judge personalities, their philosophies, and expectations relevant to ${modeDisplay.toLowerCase()} practice.`}
          icon={<GavelIcon />}
          onClick={() => navigate(ROUTES.JUDGES)}
          buttonText="View Judges"
        />

        <BentoItem
          title="Opposing Counsel"
          description={`Learn about the specialized AI Opposing Counsel you'll face in the ${modeDisplay.toLowerCase()} arena. Understand their tactics.`}
          icon={<UsersIcon />}
          onClick={() => navigate(ROUTES.OPPOSING_COUNSEL)}
          buttonText="View Counsel"
          className="md:col-span-1 lg:col-span-1" 
        />
      </div>
       <div className="text-center pt-6 pb-2">
        <p className="text-sm text-brand-text-secondary max-w-2xl mx-auto">
          {APP_NAME} is a harsh training module designed to critically assess and improve your legal argumentation and drafting skills within the {modeDisplay.toLowerCase()} legal context. Engage deeply and learn effectively.
        </p>
      </div>
    </div>
  );
};

export default HomeScreen;