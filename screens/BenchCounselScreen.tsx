import React, { useContext, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
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

  // Hooks must run unconditionally (before any early return).
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

  return (
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-8 animate-fadeIn pb-12">
      <PageHeader
        align="center"
        icon={<GavelIcon className="h-7 w-7" />}
        eyebrow="Reference"
        title="Bench & Counsel"
        subtitle={
          <>
            Review AI judges and opposing counsel for{' '}
            <span className="text-brand-text-primary font-medium">{jurisdictionLabel}</span> practice before you enter the arena.
          </>
        }
      />

      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-brand-border bg-brand-bg-secondary p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('judges')}
            className={`min-h-[44px] px-4 sm:px-6 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'judges'
                ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/30'
                : 'text-brand-text-secondary hover:text-brand-text-primary border border-transparent'
            }`}
          >
            <GavelIcon className="h-4 w-4" />
            Judges
          </button>
          <button
            type="button"
            onClick={() => setTab('counsel')}
            className={`min-h-[44px] px-4 sm:px-6 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'counsel'
                ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/30'
                : 'text-brand-text-secondary hover:text-brand-text-primary border border-transparent'
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            Opposing Counsel
          </button>
        </div>
      </div>

      {activeTab === 'judges' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {judges.map(judge => (
            <Card
              key={judge.id}
              className="flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 transition-all bg-brand-bg-primary p-0 cursor-pointer hover:bg-brand-bg-secondary"
              onClick={() => setSelectedJudge(judge)}
            >
              <div className="p-8 pb-0 flex-grow relative">
                <div className="w-14 h-14 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl flex items-center justify-center mb-6">
                  <GavelIcon className="w-7 h-7 text-brand-accent" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-brand-text-primary mb-2 group-hover:text-brand-accent transition-colors leading-tight">
                  {judge.name}
                </h3>
                <div className="h-px w-12 bg-brand-text-primary/30 mb-5" />
                <p className="text-sm font-light text-brand-text-secondary/90 leading-relaxed line-clamp-4">
                  {judge.description}
                </p>
              </div>
              <div className="p-8 pt-6 mt-auto">
                <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent border-brand-text-primary/30">
                  View Judicial Profile
                </Button>
              </div>
            </Card>
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {counsel.map(oc => (
            <Card
              key={oc.id}
              className="flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 bg-brand-bg-primary p-0 cursor-pointer hover:bg-brand-bg-secondary transition-all"
              onClick={() => setSelectedCounsel(oc)}
            >
              <div className="p-8 pb-0 flex-grow relative">
                <div className="w-14 h-14 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl flex items-center justify-center mb-6">
                  <UsersIcon className="w-7 h-7 text-brand-accent" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-brand-text-primary mb-1 group-hover:text-brand-accent transition-colors leading-tight">
                  {oc.name}
                </h3>
                <p className="text-[11px] font-mono uppercase tracking-wider text-brand-accent/80 mb-4">{oc.specialty}</p>
                <div className="h-px w-12 bg-brand-text-primary/30 mb-5" />
                <p className="text-sm font-light text-brand-text-secondary/90 leading-relaxed line-clamp-4">
                  {oc.description}
                </p>
              </div>
              <div className="p-8 pt-6 mt-auto">
                <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent border-brand-text-primary/30">
                  View Counsel Profile
                </Button>
              </div>
            </Card>
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
  );
};

export default BenchCounselScreen;
