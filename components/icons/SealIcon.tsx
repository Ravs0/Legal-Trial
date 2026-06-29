import React from 'react';

export const SealIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="7.5" strokeDasharray="2 2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10M8.5 10.5h7M9.5 13.5h5" />
  </svg>
);
