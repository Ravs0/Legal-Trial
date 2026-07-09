import React from 'react';

export const BackgroundGeometry: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {/* Blueprint Grid Overlay — visible */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#D6BA91" strokeWidth="0.6" />
            <circle cx="0" cy="0" r="1.5" fill="#D6BA91" />
          </pattern>
          <pattern id="grid-sm" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#D6BA91" strokeWidth="0.2" />
          </pattern>
        </defs>
        {/* Fine sub-grid */}
        <rect width="100%" height="100%" fill="url(#grid-sm)" opacity="0.4" />
        {/* Main grid */}
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Corner crosshairs - top left */}
        <path d="M 50 50 L 50 20 M 50 50 L 20 50" stroke="#D6BA91" strokeWidth="0.8" fill="none" opacity="0.6"/>
        <circle cx="50" cy="50" r="2" fill="none" stroke="#D6BA91" strokeWidth="0.6" opacity="0.5"/>
        {/* Corner crosshairs - top right */}
        <path d="M calc(100% - 50px) 50 L calc(100% - 50px) 20 M calc(100% - 50px) 50 L calc(100% - 20px) 50" stroke="#D6BA91" strokeWidth="0.8" fill="none" opacity="0.6"/>
        {/* Bottom left */}
        <path d="M 50 calc(100% - 50px) L 50 calc(100% - 20px) M 50 calc(100% - 50px) L 20 calc(100% - 50px)" stroke="#D6BA91" strokeWidth="0.8" fill="none" opacity="0.6"/>
      </svg>

      {/* Rotating Astrolabe Compass Rings — Top Right */}
      <div className="absolute -top-40 -right-40 w-[560px] h-[560px] opacity-[0.045] animate-[spin_120s_linear_infinite]">
        <svg className="w-full h-full text-brand-accent" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.3">
          <circle cx="100" cy="100" r="95" strokeDasharray="2,3" />
          <circle cx="100" cy="100" r="88" />
          <circle cx="100" cy="100" r="75" strokeDasharray="1,2" />
          <circle cx="100" cy="100" r="60" strokeDasharray="4,1" />
          <circle cx="100" cy="100" r="44" />
          <circle cx="100" cy="100" r="28" strokeDasharray="2,2" />
          <line x1="100" y1="5" x2="100" y2="195" strokeWidth="0.2"/>
          <line x1="5" y1="100" x2="195" y2="100" strokeWidth="0.2"/>
          <line x1="33" y1="33" x2="167" y2="167" strokeWidth="0.2"/>
          <line x1="33" y1="167" x2="167" y2="33" strokeWidth="0.2"/>
          {/* Tick marks */}
          {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg) => (
            <line
              key={deg}
              x1={100 + 92 * Math.cos((deg * Math.PI) / 180)}
              y1={100 + 92 * Math.sin((deg * Math.PI) / 180)}
              x2={100 + 95 * Math.cos((deg * Math.PI) / 180)}
              y2={100 + 95 * Math.sin((deg * Math.PI) / 180)}
              strokeWidth="1"
            />
          ))}
        </svg>
      </div>

      {/* Sacred Geometry Octagram — Bottom Left */}
      <div className="absolute -bottom-48 -left-48 w-[650px] h-[650px] opacity-[0.07] animate-[spin_200s_linear_infinite_reverse]">
        <svg className="w-full h-full text-brand-accent" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.25">
          <polygon points="100,15 156,72 185,100 156,128 100,185 44,128 15,100 44,72" />
          <polygon points="100,35 148,82 165,100 148,118 100,165 52,118 35,100 52,82" />
          <polygon points="100,55 136,88 145,100 136,112 100,145 64,112 55,100 64,88" />
          <circle cx="100" cy="100" r="95" strokeDasharray="1,4" strokeWidth="0.5"/>
          <circle cx="100" cy="100" r="82" strokeDasharray="0.5,6" />
          <path d="M 0 100 L 200 100 M 100 0 L 100 200" strokeDasharray="2,4" strokeWidth="0.2"/>
        </svg>
      </div>

      {/* Centre diamond accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] opacity-[0.03] animate-[spin_240s_linear_infinite]">
        <svg className="w-full h-full text-brand-accent" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.3">
          <polygon points="50,5 95,50 50,95 5,50" />
          <polygon points="50,18 82,50 50,82 18,50" />
          <polygon points="50,32 68,50 50,68 32,50" />
          <circle cx="50" cy="50" r="44" strokeDasharray="1,3"/>
          <circle cx="50" cy="50" r="30" strokeDasharray="0.5,2"/>
        </svg>
      </div>

      {/* Coordinate text along left edge */}
      <div className="absolute inset-y-12 left-4 flex flex-col justify-between text-[7px] font-mono text-brand-text-secondary/35 uppercase tracking-widest pointer-events-none" style={{ writingMode: 'vertical-rl' }}>
        <span>sys.docket.active // index 0x7E2</span>
        <span>coordinate system [pnw-90.12]</span>
      </div>
      {/* Coordinate text along bottom */}
      <div className="absolute inset-x-12 bottom-4 flex justify-between text-[7px] font-mono text-brand-text-secondary/35 uppercase tracking-widest pointer-events-none">
        <span>grid: delta_synthesis_v4</span>
        <span>status: online</span>
      </div>
    </div>
  );
};
