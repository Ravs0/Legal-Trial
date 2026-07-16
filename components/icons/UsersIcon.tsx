import React from 'react';

/** Outline users group — monochrome via currentColor. */
export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-3.471-1.111l-1.757-1.027a3.375 3.375 0 00-3.473 0l-1.757 1.027A5.97 5.97 0 006 18.72m12 0v-1.077a3.375 3.375 0 00-1.625-2.923l-1.757-1.027a3.375 3.375 0 00-3.473 0L9.625 14.72A3.375 3.375 0 008 17.643v1.077m6-6.93A4.5 4.5 0 1012 6a4.5 4.5 0 000 5.79z"
    />
  </svg>
);
