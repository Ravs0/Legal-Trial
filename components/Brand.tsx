import React from 'react';
import { APP_NAME } from '../routes';

export const Brand: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span className="brand-lockup">
    <svg className="brand-mark" viewBox="0 0 32 36" fill="none" aria-hidden="true">
      <path d="M5 29h22M8 25h16M11 11v10M16 11v10M21 11v10M6 8l10-5 10 5H6Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 31v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
    {!compact && <span className="brand-name">{APP_NAME}<span className="brand-period">.</span></span>}
  </span>
);
