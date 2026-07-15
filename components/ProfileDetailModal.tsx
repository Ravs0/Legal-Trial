import React from 'react';
import { Modal } from './Modal';
import { JudgePersonality, OpposingCounselPersonality } from '../types';
import { GavelIcon } from './icons/GavelIcon';
import { UsersIcon } from './icons/UsersIcon';
import { Button } from './Button';

interface ProfileDetailModalProps {
  profile: JudgePersonality | OpposingCounselPersonality | null;
  onClose: () => void;
}

export const ProfileDetailModal: React.FC<ProfileDetailModalProps> = ({ profile, onClose }) => {
  if (!profile) return null;

  const isAdvocate = 'specialty' in profile;
  const ProfileIcon = isAdvocate ? UsersIcon : GavelIcon;

  return (
    <Modal isOpen={!!profile} onClose={onClose} title={isAdvocate ? "Counsel Dossier" : "Judicial Profile"} size="xl">
      <div className="flex flex-col sm:flex-row items-center sm:items-start sm:space-x-8">
        <div className="flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-brand-navy border border-brand-accent/20 mb-6 sm:mb-0 flex items-center justify-center relative shadow-inner-subtle">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/10 to-transparent rounded-2xl mix-blend-overlay"></div>
          <ProfileIcon className="w-16 h-16 sm:w-20 sm:h-20 text-brand-accent drop-shadow-lg z-10" />
        </div>

        <div className="text-center sm:text-left flex-grow space-y-4">
          <div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-brand-text-secondary/70 block mb-1">
              {isAdvocate ? "Opposing Counsel" : "The Bench"}
            </span>
            <h3 className="text-3xl font-bold text-brand-text-primary font-serif leading-tight">{profile.name}</h3>
          </div>

          {isAdvocate && (
            <div className="inline-block px-3 py-1 bg-brand-accent/10 border border-brand-accent/30 rounded-md">
              <span className="text-xs font-mono font-medium text-brand-accent uppercase tracking-wider">
                {((profile as OpposingCounselPersonality).specialty)}
              </span>
            </div>
          )}

          <div className="w-full h-px bg-gradient-to-r from-brand-accent/40 to-transparent my-4"></div>

          <div className="bg-brand-bg-primary/30 p-4 rounded-xl border border-brand-border-light font-light shadow-inner-subtle">
            <p className="text-sm text-brand-text-secondary leading-relaxed whitespace-pre-line text-left">
              {profile.description}
            </p>
          </div>
          <p className="text-[11px] leading-relaxed text-brand-text-secondary/75 text-left">
            This is a simulated training persona. The profile describes a mock courtroom approach, not a biographical statement, endorsement, or source of legal authority.
          </p>
        </div>
      </div>
      <div className="mt-8 pt-5 border-t border-brand-accent/10 flex justify-end">
        <Button
          onClick={onClose}
          variant="outline"
          className="px-8 border-brand-text-secondary/30 text-brand-text-secondary hover:text-brand-text-primary"
        >
          Close Dossier
        </Button>
      </div>
    </Modal>
  );
};
