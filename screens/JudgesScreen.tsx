
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
    <div className="space-y-16 animate-fadeIn pb-12 overflow-x-hidden relative">
      <div className="absolute top-[10%] left-[-5%] w-[30rem] h-[30rem] bg-brand-accent/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[20%] right-[-10%] w-[40rem] h-[40rem] bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>

      <div className="text-center pt-8 relative z-10 max-w-4xl mx-auto px-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-navy border border-brand-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-glow-gold-sm">
          <GavelIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent drop-shadow-md" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-accent/50"></div>
          <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase">The Bench</span>
          <div className="h-px w-8 bg-brand-accent/50"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-shimmer font-serif tracking-tight drop-shadow-md mb-4">Meet the Judges</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto leading-relaxed">
          Familiarize yourself with the distinguished AI jurists presiding over the <span className="text-brand-text-primary font-medium">{screenTitle}</span>. Each brings a distinct judicial philosophy to their courtroom.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {judgesToDisplay.map((judge: JudgePersonality) => (
            <Card
              key={judge.id}
              className="flex flex-col h-full overflow-hidden group border border-brand-accent/10 hover:border-brand-accent/40 transition-all duration-500 bg-brand-navy/40 backdrop-blur-sm p-0 hover:-translate-y-1 hover:shadow-glow-gold-sm cursor-pointer"
              onClick={() => setSelectedProfile(judge)}
            >
              <div className="p-8 pb-0 flex-grow relative">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brand-accent/10 to-transparent rounded-bl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                <div className="w-14 h-14 bg-brand-navy border border-brand-accent/20 rounded-xl flex items-center justify-center mb-6 shadow-inner-subtle group-hover:shadow-[0_0_15px_rgba(201,168,76,0.2)] transition-shadow duration-300">
                  <GavelIcon className="w-7 h-7 text-brand-accent" />
                </div>

                <h3 className="text-2xl font-serif font-semibold text-brand-text-primary mb-2 group-hover:text-brand-accent transition-colors duration-300 leading-tight">
                  {judge.name}
                </h3>

                <div className="h-px w-12 bg-brand-accent/30 mb-5 group-hover:w-full transition-all duration-700 ease-out"></div>

                <p className="text-sm font-light text-brand-text-secondary/90 leading-relaxed line-clamp-4 group-hover:text-brand-text-secondary transition-colors duration-300">
                  {judge.description}
                </p>
              </div>

              <div className="p-8 pt-6 mt-auto">
                <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent transition-all duration-300 shadow-none border-brand-accent/20 text-brand-text-primary py-2.5">
                  View Judicial Profile
                </Button>
              </div>
            </Card>
          ))}
          {judgesToDisplay.length === 0 && (
            <div className="col-span-full p-12 border border-dashed border-brand-accent/20 rounded-2xl bg-brand-navy/20 flex flex-col items-center justify-center">
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
