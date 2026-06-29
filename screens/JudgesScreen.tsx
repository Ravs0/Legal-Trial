import React, { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { JUDGE_PERSONALITIES, INTERNATIONAL_JUDGE_PERSONALITIES, ROUTES } from '../constants';
import { JudgePersonality } from '../types';
import { GavelIcon } from '../components/icons/GavelIcon';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
import { TrialSimContext } from '../App';
import { Button } from '../components/Button';

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
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-16 animate-fadeIn pb-12 overflow-x-hidden relative">
      <div className="text-center pt-8 relative z-10 max-w-4xl mx-auto px-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl flex items-center justify-center mx-auto mb-6">
          <GavelIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
          <span className="text-[10px] font-mono text-brand-text-primary tracking-widest uppercase">The Bench</span>
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-text-primary font-serif tracking-tight mb-4">Meet the Judges</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto leading-relaxed">
          Familiarize yourself with the distinguished AI jurists presiding over the <span className="text-brand-text-primary font-medium">{screenTitle}</span>. Each brings a distinct judicial philosophy to their courtroom.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {judgesToDisplay.map((judge: JudgePersonality) => (
            <Card
              key={judge.id}
              className="flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 transition-all bg-brand-bg-primary p-0 cursor-pointer hover:bg-brand-bg-secondary"
              onClick={() => setSelectedProfile(judge)}
            >
              <div className="p-8 pb-0 flex-grow relative">
                <div className="w-14 h-14 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl flex items-center justify-center mb-6">
                  <GavelIcon className="w-7 h-7 text-brand-accent" />
                </div>

                <h3 className="text-2xl font-serif font-semibold text-brand-text-primary mb-2 group-hover:text-brand-accent transition-colors duration-300 leading-tight">
                  {judge.name}
                </h3>

                <div className="h-px w-12 bg-brand-text-primary/30 mb-5"></div>

                <p className="text-sm font-light text-brand-text-secondary/90 leading-relaxed line-clamp-4 group-hover:text-brand-text-secondary transition-colors duration-300">
                  {judge.description}
                </p>
              </div>

              <div className="p-8 pt-6 mt-auto">
                <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent transition-all duration-300 shadow-none border-brand-text-primary/30 text-brand-text-primary py-2.5">
                  View Judicial Profile
                </Button>
              </div>
            </Card>
          ))}
          {judgesToDisplay.length === 0 && (
            <div className="col-span-full p-12 border border-dashed border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary flex flex-col items-center justify-center">
              <GavelIcon className="h-12 w-12 text-brand-text-secondary/30 mb-4" />
              <p className="text-brand-text-secondary font-light">No judicial profiles currently authorized for the {practiceMode} jurisdiction.</p>
            </div>
          )}
        </div>
      </div>

      <ProfileDetailModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
};

export default JudgesScreen;
