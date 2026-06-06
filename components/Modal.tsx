import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

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
      className="fixed inset-0 bg-brand-bg-primary/95 flex items-center justify-center z-50 p-4 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`relative bg-brand-bg-primary border border-brand-text-primary/30 rounded-none w-full ${sizeClasses[size]} transform transition-all animate-slideInUp max-h-full overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="p-5 sm:p-6 pb-4 border-b border-brand-text-primary/30 flex justify-between items-center relative z-10 bg-brand-bg-primary">
            <h3 className="text-xl sm:text-2xl font-semibold text-brand-text-primary font-serif tracking-tight pr-4">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-none text-brand-text-secondary hover:bg-brand-text-primary/10 hover:text-brand-text-primary transition-colors flex-shrink-0"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {!title && (
          <div className="absolute top-4 right-4 z-20">
            <button
              onClick={onClose}
              className="p-2 rounded-none text-brand-text-secondary hover:bg-brand-text-primary/10 hover:text-brand-text-primary transition-colors"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
};