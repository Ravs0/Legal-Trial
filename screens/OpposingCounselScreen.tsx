
import React, { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES, ROUTES } from '../constants';
import { OpposingCounselPersonality } from '../types';
import { UsersIcon } from '../components/icons/UsersIcon'; 
import { ProfileDetailModal } from '../components/ProfileDetailModal'; 
import { TrialSimContext } from '../App';

// Renamed from AdvocatesScreen to OpposingCounselScreen for clarity if this was the intent.
// Assuming this file is what was previously 'AdvocatesScreen.tsx' based on user prompt.
const OpposingCounselScreen: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<OpposingCounselPersonality | null>(null);
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found in OpposingCounselScreen");
  const { practiceMode } = context;

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const personalitiesToDisplay = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
  const screenTitle = practiceMode === 'international' ? "International Opposing Counsel" : "Indian Opposing Counsel";


  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Main title card uses new red gradient */}
      <Card 
        className="bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-center shadow-neumorphic-raised"
        titleGradient={false} // Gradient is on card background
      >
        <div className="py-8 px-4">
          {/* Icon color updated for visibility on red gradient */}
          <UsersIcon className="h-16 w-16 text-brand-accent-text mx-auto mb-4 opacity-80" />
          {/* Text color updated for visibility on red gradient */}
          <h1 className="text-4xl font-bold text-brand-accent-text mb-2 font-serif">Opposing Counsel Profiles: <span className="italic">{screenTitle}</span></h1>
          <p className="text-red-100 max-w-xl mx-auto opacity-90">
            Prepare to face formidable AI Opposing Counsel. Each brings specialized expertise and a distinct argumentative style relevant to the {practiceMode.toLowerCase()} context.
          </p>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {personalitiesToDisplay.map((oc: OpposingCounselPersonality) => (
          <Card 
            key={oc.id}
            className="flex flex-col" // Card base is neumorphic
            icon={<UsersIcon className="w-full h-full" />} // Icon in Card is red by default
            onClick={() => setSelectedProfile(oc)}
            hoverEffect={true}
            title={oc.name} // Card title is red by default
          >
            <div className="p-5 pt-0"> 
              {/* Specialty text color updated (e.g., lighter red or white for contrast) */}
              <p className="text-sm font-medium text-red-300 mb-2"> 
                {oc.specialty}
              </p>
              <p className="text-sm text-brand-text-secondary leading-relaxed line-clamp-6 flex-grow">
                {oc.description}
              </p>
            </div>
          </Card>
        ))}
        {personalitiesToDisplay.length === 0 && (
            <p className="text-brand-text-secondary md:col-span-3 text-center py-6">No opposing counsel currently configured for the {practiceMode} mode.</p>
        )}
      </div>
      {/* ProfileDetailModal will inherit new red/white theme */}
      <ProfileDetailModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

export default OpposingCounselScreen;
