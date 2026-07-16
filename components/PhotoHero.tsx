import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PhotoMonoOverlays } from './SurfacePattern';

interface PhotoHeroProps {
  image: string;
  /**
   * Accessible description of the photograph.
   * Defaults from string `title`, then `eyebrow`, then a generic label.
   * Pass `""` to force a decorative image (text content remains the accessible name).
   */
  alt?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** compact | default | tall */
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
  /** Force grayscale / warm monochrome photo grade (design.md). Default true. */
  monochrome?: boolean;
  /** Heroes are above-the-fold; default eager. */
  loading?: 'eager' | 'lazy';
}

const heightClass = {
  sm: 'min-h-[120px] sm:min-h-[140px]',
  md: 'min-h-[160px] sm:min-h-[200px]',
  lg: 'min-h-[200px] sm:min-h-[260px]',
};

type LoadStatus = 'loading' | 'loaded' | 'error';

function resolveAlt(
  alt: string | undefined,
  title: React.ReactNode,
  eyebrow?: string,
): string {
  if (alt !== undefined) return alt;
  if (typeof title === 'string' && title.trim()) return title;
  if (eyebrow && eyebrow.trim()) return eyebrow;
  return 'LexForge photo banner';
}

/** Shared photo banner used across interior screens. */
export const PhotoHero: React.FC<PhotoHeroProps> = ({
  image,
  alt: altProp,
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
  size = 'md',
  align = 'left',
  monochrome = true,
  loading = 'eager',
}) => {
  const alignCls = align === 'center' ? 'text-center items-center' : 'text-left items-start';
  const titleId = useId();
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const resolvedAlt = resolveAlt(altProp, title, eyebrow);
  const isDecorative = resolvedAlt === '';

  // Reset load state when the asset URL changes.
  useEffect(() => {
    setStatus('loading');
  }, [image]);

  // Cached / already-complete images may not fire onLoad after mount.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      setStatus(img.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [image]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-brand-border bg-brand-bg-secondary ${heightClass[size]} ${className}`}
      aria-labelledby={titleId}
      aria-busy={status === 'loading' || undefined}
    >
      {/* Monochrome base + skeleton while the photo loads */}
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
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out',
            monochrome ? 'grayscale contrast-[1.05] brightness-[0.92] saturate-0' : '',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}

      {/* Error fallback: quiet monochrome field (no broken-image icon) */}
      {status === 'error' && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#141414] via-[#0f0f0f] to-[#1a1a1a]"
          aria-hidden="true"
        />
      )}

      <PhotoMonoOverlays variant="hero" />

      <div className={`relative z-10 h-full flex flex-col justify-end p-5 sm:p-7 gap-4 ${alignCls}`}>
        <div className={`flex flex-col gap-2 max-w-2xl ${alignCls}`}>
          {eyebrow && (
            <p className="text-[11px] sm:text-[12px] uppercase tracking-[0.14em] text-white/55">{eyebrow}</p>
          )}
          <h1
            id={titleId}
            className="text-[1.45rem] sm:text-[1.85rem] font-serif font-semibold text-white leading-snug tracking-tight"
          >
            {title}
          </h1>
          {subtitle && (
            <div className="text-[13px] sm:text-[14px] text-white/70 leading-relaxed max-w-lg">
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div className={`flex flex-wrap gap-2 ${align === 'center' ? 'justify-center' : ''}`}>
            {actions}
          </div>
        )}
      </div>
    </section>
  );
};
