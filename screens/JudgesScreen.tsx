
import React, { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
// Fix: Import separate international personality array
import { JUDGE_PERSONALITIES, INTERNATIONAL_JUDGE_PERSONALITIES, ROUTES } from '../constants';
import { JudgePersonality } from '../types';
import { GavelIcon } from '../components/icons/GavelIcon';
import { ProfileDetailModal } from '../components/ProfileDetailModal'; 
import { TrialSimContext } from '../App';

const JudgesScreen: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<JudgePersonality | null>(null);
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found in JudgesScreen");
  const { practiceMode } = context;

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const judgesToDisplay = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
  const screenTitle = practiceMode === 'international' ? "International Judiciary" : "Indian Judiciary";

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Main title card uses new red gradient */}
      <Card 
        className="bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-center shadow-neumorphic-raised"
        titleGradient={false} // Gradient is on card background
      >
        <div className="py-8 px-4">
          {/* Icon color updated for visibility on red gradient */}
          <GavelIcon className="h-16 w-16 text-brand-accent-text mx-auto mb-4 opacity-80" />
           {/* Text color updated for visibility on red gradient */}
          <h1 className="text-4xl font-bold text-brand-accent-text mb-2 font-serif">Meet the Judges: <span className="italic">{screenTitle}</span></h1>
          <p className="text-red-100 max-w-xl mx-auto"> 
            Discover the AI Judges who will preside over your mock trials. Each has a unique judicial philosophy and approach relevant to the {practiceMode.toLowerCase()} context.
          </p>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {judgesToDisplay.map((judge: JudgePersonality) => (
          <Card 
            key={judge.id}
            className="flex flex-col" // Card base is neumorphic
            icon={<GavelIcon className="w-full h-full" />} // Icon in Card is red by default
            onClick={() => setSelectedProfile(judge)}
            hoverEffect={true}
            title={judge.name} // Card title is red by default
          >
            <div className="p-5 pt-0"> 
              <p className="text-sm text-brand-text-secondary leading-relaxed line-clamp-6 flex-grow">
                {judge.description}
              </p>
            </div>
          </Card>
        ))}
        {judgesToDisplay.length === 0 && (
            <p className="text-brand-text-secondary md:col-span-3 text-center py-6">No judges currently configured for the {practiceMode} mode.</p>
        )}
      </div>
       {/* ProfileDetailModal will inherit new red/white theme */}
      <ProfileDetailModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

export default JudgesScreen;
