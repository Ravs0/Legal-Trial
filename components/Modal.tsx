import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 animate-fadeIn" 
      onClick={onClose} 
    >
      <div
        // Modal background is now brand-bg-primary, with neumorphic raised shadow
        className={`bg-brand-bg-primary rounded-lg shadow-neumorphic-raised w-full ${sizeClasses[size]} transform transition-all animate-slideInUp border border-[var(--neumorphic-shadow-light-var)] opacity-95`}
        onClick={(e) => e.stopPropagation()} 
      >
        <div className={`p-5 sm:p-6 ${title ? 'border-b border-[var(--neumorphic-shadow-dark-var)] opacity-60' : ''} flex justify-between items-center`}>
          {title && (
            // Title color now uses new red brand-accent
            <h3 className="text-xl font-semibold text-brand-accent">{title}</h3> 
          )}
          <button
            onClick={onClose}
            // Close button hover uses new red brand-accent
            className={`p-1 rounded-full text-brand-text-secondary hover:bg-brand-bg-secondary hover:text-brand-accent transition-colors ${title ? '' : 'ml-auto'}`} 
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 sm:p-6">
            {children}
        </div>
      </div>
    </div>
  );
};