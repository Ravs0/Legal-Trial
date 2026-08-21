import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhotoMonoOverlays } from './SurfacePattern';

interface PhotoTileProps {
  title: string;
  description?: string;
  image: string;
  /**
   * Accessible description of the photograph.
   * Defaults to decorative (`""`) when the tile has visible title text (and button name).
   * Pass a non-empty string only when the photo itself is informative beyond the label.
   */
  alt?: string;
  onClick?: () => void;
  badge?: string;
  /** Optional trailing meta (e.g. "3 done") opposite the badge. */
  meta?: string;
  className?: string;
  compact?: boolean;
  /** Force grayscale / warm monochrome photo grade (design.md). Default true. */
  monochrome?: boolean;
  /** Tiles are often below the fold; default lazy. */
  loading?: 'eager' | 'lazy';
}

type LoadStatus = 'loading' | 'loaded' | 'error';

export const PhotoTile: React.FC<PhotoTileProps> = ({
  title,
  description,
  image,
  alt: altProp,
  onClick,
  badge,
  meta,
  className = '',
  compact = false,
  monochrome = true,
  loading = 'lazy',
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

  // Visible title/description name the control; photo is decorative by default.
  const resolvedAlt = altProp !== undefined ? altProp : '';
  const isDecorative = resolvedAlt === '';
  const accessibleName = description ? `${title}. ${description}` : title;

  useEffect(() => {
    setStatus('loading');
  }, [image]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      setStatus(img.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [image]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  const inner = (
    <>
      <div className="absolute inset-0 bg-brand-bg-secondary" aria-hidden="true" />
      {status === 'loading' && (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/[0.02] via-white/[0.05] to-white/[0.02]"
          aria-hidden="true"
        />
      )}

      {status !== 'error' && (
        <img
          ref={imgRef}
          src={image}
          alt={resolvedAlt}
          loading={loading}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          aria-hidden={isDecorative ? true : undefined}
          className={[
            'absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.04]',
            monochrome ? 'grayscale contrast-[1.05] brightness-[0.92] saturate-0' : '',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}

      {status === 'error' && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#141414] via-[#0f0f0f] to-[#1a1a1a]"
          aria-hidden="true"
        />
      )}

      <PhotoMonoOverlays variant="tile" />

      <div className={`relative z-10 h-full flex flex-col justify-end ${compact ? 'p-3' : 'p-3.5 sm:p-4'}`}>
        {(badge || meta) && (
          <div className="mb-1.5 flex items-center justify-between gap-2">
            {badge ? (
              <span className="text-[10px] uppercase tracking-[0.12em] text-brand-text-primary/55">{badge}</span>
            ) : (
              <span />
            )}
            {meta && (
              <span className="text-[10px] tabular-nums tracking-wide text-brand-text-primary/50 shrink-0">{meta}</span>
            )}
          </div>
        )}
        <p className={`font-medium text-brand-text-primary leading-snug ${compact ? 'text-[13px] sm:text-[14px]' : 'text-[14px] sm:text-[15px]'}`}>
          {title}
        </p>
        {description && (
          <p className="mt-1 text-[12px] text-brand-text-primary/62 leading-snug line-clamp-2">{description}</p>
        )}
      </div>
    </>
  );

  const base = `group relative overflow-hidden rounded-lg border border-brand-border text-left bg-brand-bg-secondary w-full
    ${compact ? 'min-h-[96px] sm:min-h-[104px]' : 'min-h-[148px] sm:min-h-[168px]'}
    ${onClick ? 'cursor-pointer hover:border-brand-border transition-colors duration-200' : ''}
    ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={accessibleName}
        aria-busy={status === 'loading' || undefined}
        className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/30`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={base} role="img" aria-label={accessibleName} aria-busy={status === 'loading' || undefined}>
      {inner}
    </div>
  );
};
