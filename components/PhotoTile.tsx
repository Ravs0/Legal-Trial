import React from 'react';

interface PhotoTileProps {
  title: string;
  description?: string;
  image: string;
  onClick?: () => void;
  badge?: string;
  className?: string;
  compact?: boolean;
}

export const PhotoTile: React.FC<PhotoTileProps> = ({
  title,
  description,
  image,
  onClick,
  badge,
  className = '',
  compact = false,
}) => {
  const inner = (
    <>
      <img
        src={image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      <div className={`relative z-10 h-full flex flex-col justify-end ${compact ? 'p-3' : 'p-4'}`}>
        {badge && (
          <span className="mb-1.5 text-[10px] uppercase tracking-wide text-white/55">{badge}</span>
        )}
        <p className={`font-medium text-white ${compact ? 'text-[14px]' : 'text-[15px]'}`}>{title}</p>
        {description && (
          <p className="mt-1 text-[12px] text-white/65 leading-snug line-clamp-2">{description}</p>
        )}
      </div>
    </>
  );

  const base = `group relative overflow-hidden rounded-xl border border-brand-border text-left
    ${compact ? 'min-h-[100px]' : 'min-h-[128px] sm:min-h-[140px]'}
    ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30`}
      >
        {inner}
      </button>
    );
  }

  return <div className={base}>{inner}</div>;
};
