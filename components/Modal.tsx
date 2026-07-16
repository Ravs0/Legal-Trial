import React, { useEffect, useId, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Nested modal support: body scroll lock + topmost Escape / focus trap
let openModalCount = 0;
const modalCloseStack: Array<() => void> = [];

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    // offsetParent is null for fixed/sticky in some cases; allow those via position
    return el.offsetParent !== null || style.position === 'fixed' || style.position === 'sticky';
  });
}

const focusRing =
  'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/35';

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Body scroll lock (nested-safe)
  useEffect(() => {
    if (isOpen) {
      openModalCount += 1;
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
      if (isOpen) {
        openModalCount = Math.max(0, openModalCount - 1);
        if (openModalCount === 0) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [isOpen]);

  // Focus restore, initial focus, Escape (topmost only), Tab trap
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const close = () => onCloseRef.current();
    modalCloseStack.push(close);

    const dialog = dialogRef.current;
    const focusInitial = () => {
      if (!dialog) return;
      const focusable = getFocusable(dialog);
      // Prefer first content control over the chrome close button when present
      const preferred =
        focusable.find((el) => el.getAttribute('aria-label') !== 'Close modal') ?? focusable[0];
      (preferred ?? dialog).focus();
    };
    const raf = requestAnimationFrame(focusInitial);

    const isTopmost = () => modalCloseStack[modalCloseStack.length - 1] === close;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;

      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      const idx = modalCloseStack.lastIndexOf(close);
      if (idx >= 0) modalCloseStack.splice(idx, 1);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg-primary/95 p-4 sm:p-6 animate-fadeIn"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={`relative flex max-h-full w-full transform flex-col overflow-hidden rounded-2xl border border-brand-text-primary/30 bg-brand-bg-primary transition-all animate-slideInUp ${sizeClasses[size]} ${focusRing}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="relative z-10 flex items-center justify-between border-b border-brand-text-primary/30 bg-brand-bg-primary p-5 pb-4 sm:p-6">
            <h3
              id={titleId}
              className="pr-4 font-serif text-xl font-semibold tracking-tight text-brand-text-primary sm:text-2xl"
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className={`-mr-2 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-xl p-2 text-brand-text-secondary transition-colors hover:bg-brand-text-primary/10 hover:text-brand-text-primary ${focusRing}`}
              aria-label="Close modal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {!title && (
          <div className="absolute right-4 top-4 z-20">
            <button
              type="button"
              onClick={onClose}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-brand-text-secondary transition-colors hover:bg-brand-text-primary/10 hover:text-brand-text-primary ${focusRing}`}
              aria-label="Close modal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="custom-scrollbar relative z-10 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
};
