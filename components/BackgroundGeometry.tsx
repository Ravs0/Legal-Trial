import React from 'react';

export const BackgroundGeometry: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {/* Structural Thin Blueprint Grid Overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#D6BA91" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="1.5" fill="#D6BA91" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Crosshair details in corners */}
        <path d="M 30 30 L 30 15 M 30 30 L 15 30" stroke="#D6BA91" strokeWidth="1" fill="none" />
        <path d="M 30 100 L 30 115 M 30 100 L 15 100" stroke="#D6BA91" strokeWidth="1" fill="none" />
      </svg>

      {/* Rotating Astrolabe Compass Rings (Top Right) */}
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] opacity-[0.03] animate-[spin_120s_linear_infinite]">
        <svg className="w-full h-full text-brand-accent" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.25">
          <circle cx="100" cy="100" r="95" strokeDasharray="2,2" />
          <circle cx="100" cy="100" r="90" />
          <circle cx="100" cy="100" r="75" />
          <circle cx="100" cy="100" r="60" strokeDasharray="4,1" />
          <circle cx="100" cy="100" r="40" />
          <line x1="100" y1="5" x2="100" y2="195" />
          <line x1="5" y1="100" x2="195" y2="100" />
          <line x1="33" y1="33" x2="167" y2="167" />
          <line x1="33" y1="167" x2="167" y2="33" />
        </svg>
      </div>

      {/* Sacred Geometry Polyhedron / Octagram Wireframe (Bottom Left) */}
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] opacity-[0.025] animate-[spin_180s_linear_infinite]">
        <svg className="w-full h-full text-brand-text-primary" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.2">
          {/* Inner concentric stars */}
          <polygon points="100,20 156,76 180,100 156,124 100,180 44,124 20,100 44,76" />
          <polygon points="100,40 142,82 160,100 142,118 100,160 58,118 40,100 58,82" />
          <polygon points="100,60 128,88 140,100 128,112 100,140 72,112 60,100 72,88" />
          {/* Outer Ring ticks */}
          <circle cx="100" cy="100" r="95" />
          <circle cx="100" cy="100" r="85" strokeDasharray="1,5" strokeWidth="1" />
          {/* Cross lines */}
          <path d="M 0 100 L 200 100 M 100 0 L 100 200" strokeDasharray="3,3" />
        </svg>
      </div>

      {/* Fine Coordinate Ticks along screen borders */}
      <div className="absolute inset-y-12 left-4 flex flex-col justify-between text-[7px] font-mono text-brand-text-secondary/20 uppercase tracking-widest pointer-events-none" style={{ writingMode: 'vertical-rl' }}>
        <span>sys.docket.active // index 0x7E2</span>
        <span>coordinate system [pnw-90.12]</span>
      </div>
      <div className="absolute inset-x-12 bottom-4 flex justify-between text-[7px] font-mono text-brand-text-secondary/20 uppercase tracking-widest pointer-events-none">
        <span>grid: delta_synthesis_v4</span>
        <span>status: online</span>
      </div>
    </div>
  );
};
