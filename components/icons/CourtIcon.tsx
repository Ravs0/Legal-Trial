import React from 'react';

/** Scales of justice — monochrome via currentColor. */
export const CourtIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1.75" />
    <line x1="7" y1="21" x2="17" y2="21" strokeWidth="1.75" />
    <line x1="3" y1="7" x2="21" y2="7" strokeWidth="1.75" />
    <line x1="6" y1="7" x2="6" y2="14" strokeWidth="1" />
    <path d="M 3 14 C 3 16.5, 9 16.5, 9 14 Z" strokeWidth="1" fill="none" />
    <line x1="18" y1="7" x2="18" y2="14" strokeWidth="1" />
    <path d="M 15 14 C 15 16.5, 21 16.5, 21 14 Z" strokeWidth="1" fill="none" />
  </svg>
);
