import React, { useId } from 'react';
import { Modal } from './Modal';
import { JudgePersonality, OpposingCounselPersonality } from '../types';
import { GavelIcon, UsersIcon } from './icons';
import { Button } from './Button';

interface ProfileDetailModalProps {
  profile: JudgePersonality | OpposingCounselPersonality | null;
  onClose: () => void;
}

function isCounselProfile(
  profile: JudgePersonality | OpposingCounselPersonality,
): profile is OpposingCounselPersonality {
  return 'specialty' in profile;
}

export const ProfileDetailModal: React.FC<ProfileDetailModalProps> = ({ profile, onClose }) => {
  const descriptionId = useId();
  const disclaimerId = useId();

  if (!profile) return null;

  const isAdvocate = isCounselProfile(profile);
  const ProfileIcon = isAdvocate ? UsersIcon : GavelIcon;
  const roleLabel = isAdvocate ? 'Opposing counsel' : 'The bench';
  const title = isAdvocate ? 'Counsel dossier' : 'Judicial profile';

  return (
    <Modal isOpen={!!profile} onClose={onClose} title={title} size="xl">
      <article
        className="space-y-6"
        aria-describedby={`${descriptionId} ${disclaimerId}`}
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
          <div
            className="flex-shrink-0 w-28 h-28 sm:w-36 sm:h-36 rounded-lg bg-brand-bg-secondary border border-white/10 flex items-center justify-center"
            aria-hidden="true"
          >
            <ProfileIcon className="w-14 h-14 sm:w-16 sm:h-16 text-brand-text-secondary" />
          </div>

          <div className="text-center sm:text-left flex-grow min-w-0 space-y-3 w-full">
            <header className="space-y-1">
              <p className="text-[10px] font-mono tracking-widest uppercase text-brand-text-secondary">
                {roleLabel}
              </p>
              <h3 className="text-2xl sm:text-3xl font-semibold text-brand-text-primary font-serif leading-tight tracking-tight">
                {profile.name}
              </h3>
            </header>

            {isAdvocate && (
              <p className="inline-flex items-center px-2.5 py-1 rounded-md border border-white/15 bg-[#1c1914]/[0.05] text-[11px] font-mono font-medium text-brand-text-primary uppercase tracking-wider">
                <span className="sr-only">Specialty: </span>
                {profile.specialty}
              </p>
            )}

            <div className="w-full h-px bg-white/10" role="separator" aria-hidden="true" />

            <section
              id={descriptionId}
              aria-label="Profile description"
              className="bg-brand-bg-secondary/60 p-4 rounded-md border border-white/10 text-left"
            >
              <p className="text-sm text-brand-text-secondary leading-relaxed whitespace-pre-line">
                {profile.description}
              </p>
            </section>

            <p
              id={disclaimerId}
              role="note"
              className="text-[11px] leading-relaxed text-brand-text-secondary/80 text-left"
            >
              Simulated training persona only. Mock courtroom approach, not a biography, endorsement, or legal authority.
            </p>
          </div>
        </div>

        <div className="pt-5 border-t border-white/10 flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="min-h-11 px-6"
          >
            Close
          </Button>
        </div>
      </article>
    </Modal>
  );
};
