
import React, { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES, ROUTES } from '../constants';
import { OpposingCounselPersonality } from '../types';
import { UsersIcon } from '../components/icons/UsersIcon'; 
import { ProfileDetailModal } from '../components/ProfileDetailModal'; 
import { TrialSimContext } from '../App';

const AdvocatesScreen: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<OpposingCounselPersonality | null>(null);
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found in AdvocatesScreen");
  const { practiceMode } = context;

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const advocatesToDisplay = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
  const screenTitle = practiceMode === 'international' ? "International Advocates" : "Indian Advocates";


  return (
    <div className="space-y-10 animate-fadeIn">
      <Card className="bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to border-brand-border shadow-2xl text-center"> {/* Emerald Blue Gradient */}
        <div className="py-8">
          <UsersIcon className="h-16 w-16 text-brand-accent-text mx-auto mb-4 opacity-80" /> {/* White icon on gradient */}
          <h1 className="text-4xl font-bold text-brand-accent-text mb-2 font-serif">Meet the Advocates: <span className="italic">{screenTitle}</span></h1>
          <p className="text-neutral-100 max-w-xl mx-auto"> {/* Lighter text on gradient */}
            Prepare to face formidable AI Opposing Counsel. Each advocate brings specialized expertise and a distinct argumentative style relevant to the {practiceMode.toLowerCase()} context.
          </p>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {advocatesToDisplay.map((advocate: OpposingCounselPersonality) => (
          <Card 
            key={advocate.id}
            className="flex flex-col bg-brand-bg-secondary border-brand-border shadow-lg"
            icon={<UsersIcon className="w-full h-full" />} 
            onClick={() => setSelectedProfile(advocate)}
            hoverEffect={true}
            title={advocate.name} 
            titleClassName="text-brand-accent" 
          >
            <div className="p-5 pt-0"> 
              <p className="text-sm font-medium text-teal-300 mb-2"> {/* Lighter teal for specialty */}
                {advocate.specialty}
              </p>
              <p className="text-sm text-brand-text-secondary leading-relaxed line-clamp-6 flex-grow">
                {advocate.description}
              </p>
            </div>
          </Card>
        ))}
        {advocatesToDisplay.length === 0 && (
            <p className="text-brand-text-secondary md:col-span-3 text-center py-6">No advocates currently configured for the {practiceMode} mode.</p>
        )}
      </div>
      <ProfileDetailModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

export default AdvocatesScreen;
