import React, { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES, ROUTES } from '../constants';
import { OpposingCounselPersonality } from '../types';
import { UsersIcon } from '../components/icons/UsersIcon';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
import { TrialSimContext } from '../App';
import { Button } from '../components/Button';

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
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-16 animate-fadeIn pb-12 overflow-x-hidden relative">
      <div className="text-center pt-8 relative z-10 max-w-4xl mx-auto px-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none flex items-center justify-center mx-auto mb-6">
          <UsersIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
          <span className="text-[10px] font-mono text-brand-text-primary tracking-widest uppercase">The Opposition</span>
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-text-primary font-serif tracking-tight mb-4">Opposing Counsel Profiles</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto leading-relaxed">
          Prepare to face formidable AI Opposing Counsel in the <span className="text-brand-text-primary font-medium">{screenTitle}</span> arena. Each brings specialized expertise and a distinct argumentative strategy.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {personalitiesToDisplay.map((oc: OpposingCounselPersonality) => (
            <Card
              key={oc.id}
              className="flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 bg-brand-bg-primary p-0 cursor-pointer hover:bg-brand-bg-secondary transition-all"
              onClick={() => setSelectedProfile(oc)}
            >
              <div className="p-8 pb-0 flex-grow relative">
                <div className="w-14 h-14 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none flex items-center justify-center mb-6">
                  <UsersIcon className="w-7 h-7 text-brand-accent" />
                </div>

                <h3 className="text-2xl font-serif font-semibold text-brand-text-primary mb-1 group-hover:text-brand-accent transition-colors duration-300 leading-tight">
                  {oc.name}
                </h3>

                <p className="text-xs font-mono tracking-wider text-brand-accent/80 uppercase mb-4">
                  {oc.specialty}
                </p>

                <div className="h-px w-12 bg-brand-text-primary/30 mb-5"></div>

                <p className="text-sm font-light text-brand-text-secondary/90 leading-relaxed line-clamp-4 group-hover:text-brand-text-secondary transition-colors duration-300">
                  {oc.description}
                </p>
              </div>

              <div className="p-8 pt-6 mt-auto">
                <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent transition-all duration-300 shadow-none border-brand-text-primary/30 text-brand-text-primary py-2.5">
                  View Counsel Dossier
                </Button>
              </div>
            </Card>
          ))}
          {personalitiesToDisplay.length === 0 && (
            <div className="col-span-full p-12 border border-dashed border-brand-text-primary/30 rounded-none bg-brand-bg-secondary flex flex-col items-center justify-center">
              <UsersIcon className="h-12 w-12 text-brand-text-secondary/30 mb-4" />
              <p className="text-brand-text-secondary font-light">No opposing counsel currently authorized for the {practiceMode} jurisdiction.</p>
            </div>
          )}
        </div>
      </div>

      <ProfileDetailModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

export default OpposingCounselScreen;
