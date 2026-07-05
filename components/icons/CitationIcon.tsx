import React from 'react';

// A small scales-of-justice-meets-document glyph used to mark citations that
// came back from /api/caselaw (IndianKanoon). Intentionally the six-line
// shape of the sibling icons (see FolioIcon.tsx) so the directory stays
// visually consistent.
export const CitationIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5h9l3 3V19.5a.75.75 0 01-.75.75H6.75A.75.75 0 016 19.5V4.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.25h6M9 14.25h4.5M9 8.25h2.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 18.5l2.5 4 2.5-4h-5z" />
  </svg>
);
