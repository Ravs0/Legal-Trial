import React, { useContext, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';
import { GavelIcon } from '../components/icons/GavelIcon';
import { UsersIcon } from '../components/icons/UsersIcon';
import { TrialSimContext } from '../App';
import {
  JUDGE_PERSONALITIES,
  INTERNATIONAL_JUDGE_PERSONALITIES,
  OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
  ROUTES,
} from '../constants';
import { JudgePersonality, OpposingCounselPersonality } from '../types';
import judgeGavel from '../assets/judge_gavel.jpg';
import counselScales from '../assets/counsel_scales.jpg';

type BenchTab = 'judges' | 'counsel';

const BenchCounselScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: BenchTab = tabParam === 'counsel' ? 'counsel' : 'judges';

  const [selectedJudge, setSelectedJudge] = useState<JudgePersonality | null>(null);
  const [selectedCounsel, setSelectedCounsel] = useState<OpposingCounselPersonality | null>(null);

  if (!context) throw new Error('TrialSimContext not found in BenchCounselScreen');
  const { practiceMode } = context;

  const judges = useMemo(
    () => (practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES),
    [practiceMode],
  );
  const counsel = useMemo(
    () => (practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES),
    [practiceMode],
  );

  const setTab = (tab: BenchTab) => {
    setSearchParams(tab === 'judges' ? {} : { tab: 'counsel' }, { replace: true });
  };

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const jurisdictionLabel = practiceMode === 'international' ? 'International' : 'Indian';
  const heroImage = activeTab === 'judges' ? judgeGavel : counselScales;

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn">
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6 pb-12">
      <PhotoHero
        image={heroImage}
        size="md"
        eyebrow="Reference"
        title="Bench & counsel"
        subtitle={`Simulated AI judges and opposing counsel for ${jurisdictionLabel} practice. Review their mock courtroom approaches before you enter the arena.`}
      />

      <div className="flex justify-center">
        <div className="relative inline-flex rounded-lg border border-brand-border bg-brand-bg-secondary p-1 gap-1 overflow-hidden">
          <SurfacePattern variant="dots" className="opacity-80" />
          <button
            type="button"
            onClick={() => setTab('judges')}
            className={`relative z-10 min-h-[40px] px-4 sm:px-5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'judges'
                ? 'bg-white text-black'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            <GavelIcon className="h-4 w-4" />
            Judges
          </button>
          <button
            type="button"
            onClick={() => setTab('counsel')}
            className={`relative z-10 min-h-[40px] px-4 sm:px-5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'counsel'
                ? 'bg-white text-black'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            Opposing counsel
          </button>
        </div>
      </div>

      {activeTab === 'judges' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {judges.map((judge) => (
            <button
              key={judge.id}
              type="button"
              onClick={() => setSelectedJudge(judge)}
              className="text-left group"
            >
              <PatternPanel pattern="grid" className="h-full p-0 overflow-hidden transition-colors group-hover:border-white/20">
                <div className="relative h-24 overflow-hidden border-b border-brand-border">
                  <img src={judgeGavel} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)',
                    }}
                  />
                  <div className="relative z-10 h-full flex flex-col justify-end p-3.5">
                    <p className="text-[15px] font-medium text-white leading-snug">{judge.name}</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[13px] text-brand-text-secondary leading-relaxed line-clamp-3 mb-4">
                    {judge.description}
                  </p>
                  <span className="inline-flex text-[12px] text-brand-text-secondary border border-brand-border rounded-md px-2.5 py-1 group-hover:text-brand-text-primary group-hover:border-white/20">
                    View profile
                  </span>
                </div>
              </PatternPanel>
            </button>
          ))}
          {judges.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={<GavelIcon />}
                title="No judges for this jurisdiction"
                description={`No judicial profiles are authorized for ${practiceMode} practice yet.`}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {counsel.map((oc) => (
            <button
              key={oc.id}
              type="button"
              onClick={() => setSelectedCounsel(oc)}
              className="text-left group"
            >
              <PatternPanel pattern="dots" className="h-full p-0 overflow-hidden transition-colors group-hover:border-white/20">
                <div className="relative h-24 overflow-hidden border-b border-brand-border">
                  <img src={counselScales} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)',
                    }}
                  />
                  <div className="relative z-10 h-full flex flex-col justify-end p-3.5">
                    <p className="text-[11px] uppercase tracking-wide text-white/55 mb-0.5">{oc.specialty}</p>
                    <p className="text-[15px] font-medium text-white leading-snug">{oc.name}</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[13px] text-brand-text-secondary leading-relaxed line-clamp-3 mb-4">
                    {oc.description}
                  </p>
                  <span className="inline-flex text-[12px] text-brand-text-secondary border border-brand-border rounded-md px-2.5 py-1 group-hover:text-brand-text-primary group-hover:border-white/20">
                    View profile
                  </span>
                </div>
              </PatternPanel>
            </button>
          ))}
          {counsel.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={<UsersIcon />}
                title="No opposing counsel listed"
                description={`No counsel profiles for ${practiceMode} practice yet.`}
              />
            </div>
          )}
        </div>
      )}

      <ProfileDetailModal
        profile={selectedJudge || selectedCounsel}
        onClose={() => {
          setSelectedJudge(null);
          setSelectedCounsel(null);
        }}
      />
    </div>
    </div>
  );
};

export default BenchCounselScreen;
