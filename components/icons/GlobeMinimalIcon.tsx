import React from 'react';

export const GlobeMinimalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.54 9.06A13.49 13.49 0 0112 3.5m0 17a13.49 13.49 0 008.46-5.56M3.5 9H20.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5c1.987 0 3.81.788 5.194 2.083M12 3.5A7.165 7.165 0 006.806 5.583" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5c-1.987 0-3.81-.788-5.194-2.083M12 20.5a7.165 7.165 0 015.194-2.917" />
  </svg>
);
