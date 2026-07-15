import React, { useEffect, useId, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

// Reference counter for nested modals
let openModalCount = 0;

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Prevent scrolling on body when modal is open (supports nested modals)
  useEffect(() => {
    if (isOpen) {
      openModalCount++;
      if (openModalCount === 1) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = '';
      }
    }
    return () => {
      // Only clean up if this modal was the one that locked
      if (isOpen) {
        openModalCount = Math.max(0, openModalCount - 1);
        if (openModalCount === 0) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    requestAnimationFrame(() => dialog?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={`relative bg-brand-bg-primary border border-brand-text-primary/30 rounded-2xl w-full ${sizeClasses[size]} transform transition-all animate-slideInUp max-h-full overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="p-5 sm:p-6 pb-4 border-b border-brand-text-primary/30 flex justify-between items-center relative z-10 bg-brand-bg-primary">
            <h3 id={titleId} className="text-xl sm:text-2xl font-semibold text-brand-text-primary font-serif tracking-tight pr-4">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 min-h-11 min-w-11 -mr-2 rounded-xl text-brand-text-secondary hover:bg-brand-text-primary/10 hover:text-brand-text-primary transition-colors flex-shrink-0"
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
              className="p-2 min-h-11 min-w-11 rounded-xl text-brand-text-secondary hover:bg-brand-text-primary/10 hover:text-brand-text-primary transition-colors"
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
