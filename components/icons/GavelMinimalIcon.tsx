import React from 'react';

/**
 * Compact gavel silhouette for tight chrome (sidebar chips, badges).
 * Same monochrome stroke system as GavelIcon; simplified geometry.
 */
export const GavelMinimalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.25 6.75l3 3m-3-3L9 12l3 3 5.25-5.25m-3-3l1.5-1.5a1.5 1.5 0 012.121 0l.879.879a1.5 1.5 0 010 2.121L16.5 9.75M6 15.75H4.5v3.75H8.25V18M6 15.75l2.25 2.25"
    />
  </svg>
);
