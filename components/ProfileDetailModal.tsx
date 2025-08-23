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
    // Modal itself is now neumorphic via Modal.tsx updates
    <Modal isOpen={!!profile} onClose={onClose} title={profile.name} size="xl">
      <div className="flex flex-col sm:flex-row items-center sm:items-start sm:space-x-6">
        {/* Icon panel now neumorphic pressed, icon is red */}
        <div className="flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 rounded-lg bg-brand-bg-primary shadow-neumorphic-pressed mb-4 sm:mb-0 flex items-center justify-center">
          <ProfileIcon className="w-20 h-20 text-brand-accent opacity-90" /> 
        </div>
        <div className="text-center sm:text-left flex-grow">
          {/* Title is red */}
          <h3 className="text-2xl font-bold text-brand-accent mb-1 font-serif">{profile.name}</h3> 
          {isAdvocate && (
            // Specialty text is lighter red for contrast
            <p className="text-md font-semibold text-red-300 mb-3"> 
              Specialty: {(profile as OpposingCounselPersonality).specialty}
            </p>
          )}
          <p className="text-sm text-brand-text-secondary leading-relaxed whitespace-pre-line">
            {profile.description}
          </p>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 flex justify-end">
        {/* Button uses primary style (solid red background) */}
        <Button
          onClick={onClose}
          variant="primary" 
        >
          Close
        </Button>
      </div>
    </Modal>
  );
};