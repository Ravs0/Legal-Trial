import React, { useContext, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
import { PatternPanel } from '../components/SurfacePattern';
import { RoomBanner, RoomTabs } from '../components/RoomChrome';
import { GavelIcon, UsersIcon } from '../components/icons';
import { TrialSimContext } from '../App';
import {
  JUDGE_PERSONALITIES,
  INTERNATIONAL_JUDGE_PERSONALITIES,
  OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
} from '../constants';
import { ROUTES } from '../routes';
import { JudgePersonality, OpposingCounselPersonality } from '../types';
import { screenMedia } from '../assets';

type BenchTab = 'judges' | 'counsel';

const BENCH_TABS: { id: BenchTab; label: string }[] = [
  { id: 'judges', label: 'Judges' },
  { id: 'counsel', label: 'Opposing counsel' },
];

/** Unified judges + opposing counsel gallery (replaces legacy Judges / OpposingCounsel screens). */
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
    // Clear open dossier when switching tabs so selection cannot drift across galleries.
    setSelectedJudge(null);
    setSelectedCounsel(null);
    setSearchParams(tab === 'judges' ? {} : { tab: 'counsel' }, { replace: true });
  };

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const jurisdictionLabel = practiceMode === 'international' ? 'International' : 'Indian';
  const profileCount = activeTab === 'judges' ? judges.length : counsel.length;
  const cardImage = activeTab === 'judges' ? screenMedia.bench.judges : screenMedia.bench.counsel;
  const cardPattern = activeTab === 'judges' ? 'grid' : 'dots';

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-5 pb-12">
        <RoomBanner
          image={screenMedia.bench.hero}
          eyebrow="Bench"
          title="Bench & counsel"
          subtitle={`Fictional ${jurisdictionLabel} training profiles.`}
          trailing={
            <RoomTabs
              tabs={BENCH_TABS}
              active={activeTab}
              onChange={(id) => setTab(id as BenchTab)}
            />
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">
            {activeTab === 'judges' ? 'Judicial profiles' : 'Counsel profiles'}
            <span className="text-brand-text-secondary/60"> · </span>
            {jurisdictionLabel}
          </p>
          <p className="text-[11px] tabular-nums text-brand-text-secondary">
            {profileCount} {profileCount === 1 ? 'profile' : 'profiles'}
          </p>
        </div>

        {activeTab === 'judges' ? (
          <div
            role="tabpanel"
            id="bench-panel-judges"
            aria-label="Judicial profiles"
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
          >
            {judges.map((judge) => {
              const isSelected = selectedJudge?.id === judge.id;
              return (
                <button
                  key={judge.id}
                  type="button"
                  onClick={() => {
                    setSelectedCounsel(null);
                    setSelectedJudge(judge);
                  }}
                  aria-pressed={isSelected}
                  className={`text-left group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    isSelected ? 'ring-1 ring-white' : ''
                  }`}
                >
                  <PatternPanel
                    pattern={cardPattern}
                    className={`h-full p-0 overflow-hidden transition-colors ${
                      isSelected ? '!border-white' : 'group-hover:border-white/20'
                    }`}
                  >
                    <div className="relative h-24 overflow-hidden border-b border-brand-border">
                      <img
                        src={cardImage}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)',
                        }}
                      />
                      <div className="relative z-10 h-full flex flex-col justify-end p-3.5">
                        <p className="text-[15px] font-medium text-brand-text-primary leading-snug">{judge.name}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-[13px] text-brand-text-secondary leading-relaxed line-clamp-3 mb-4">
                        {judge.description}
                      </p>
                      <span
                        className={`inline-flex text-[12px] rounded-md px-2.5 py-1 border transition-colors ${
                          isSelected
                            ? 'bg-brand-text-primary text-brand-bg-primary border-white'
                            : 'text-brand-text-secondary border-brand-border group-hover:text-brand-text-primary group-hover:border-white/20'
                        }`}
                      >
                        {isSelected ? 'Open dossier' : 'Simulation profile'}
                      </span>
                    </div>
                  </PatternPanel>
                </button>
              );
            })}
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
          <div
            role="tabpanel"
            id="bench-panel-counsel"
            aria-label="Opposing counsel profiles"
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
          >
            {counsel.map((oc) => {
              const isSelected = selectedCounsel?.id === oc.id;
              return (
                <button
                  key={oc.id}
                  type="button"
                  onClick={() => {
                    setSelectedJudge(null);
                    setSelectedCounsel(oc);
                  }}
                  aria-pressed={isSelected}
                  className={`text-left group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    isSelected ? 'ring-1 ring-white' : ''
                  }`}
                >
                  <PatternPanel
                    pattern={cardPattern}
                    className={`h-full p-0 overflow-hidden transition-colors ${
                      isSelected ? '!border-white' : 'group-hover:border-white/20'
                    }`}
                  >
                    <div className="relative h-24 overflow-hidden border-b border-brand-border">
                      <img
                        src={cardImage}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)',
                        }}
                      />
                      <div className="relative z-10 h-full flex flex-col justify-end p-3.5">
                        <p className="text-[11px] uppercase tracking-wide text-brand-text-primary/55 mb-0.5">{oc.specialty}</p>
                        <p className="text-[15px] font-medium text-brand-text-primary leading-snug">{oc.name}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-[13px] text-brand-text-secondary leading-relaxed line-clamp-3 mb-4">
                        {oc.description}
                      </p>
                      <span
                        className={`inline-flex text-[12px] rounded-md px-2.5 py-1 border transition-colors ${
                          isSelected
                            ? 'bg-brand-text-primary text-brand-bg-primary border-white'
                            : 'text-brand-text-secondary border-brand-border group-hover:text-brand-text-primary group-hover:border-white/20'
                        }`}
                      >
                        {isSelected ? 'Open dossier' : 'Simulation profile'}
                      </span>
                    </div>
                  </PatternPanel>
                </button>
              );
            })}
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
