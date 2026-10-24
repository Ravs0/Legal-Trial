import React from 'react';
import { PageHeader } from './PageHeader';

interface PhotoHeroProps {
  image: string;
  alt?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
  monochrome?: boolean;
  loading?: 'eager' | 'lazy';
}

/** Compatibility surface: interior photo heroes now use the shared page heading. */
export const PhotoHero: React.FC<PhotoHeroProps> = ({
  image, eyebrow, title, subtitle, actions, className, size,
}) => <PageHeader title={title} eyebrow={eyebrow} description={subtitle} actions={actions} image={image} dense={size === 'sm'} className={className} />;
