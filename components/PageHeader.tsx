import React, { useId } from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  image?: string;
  dense?: boolean;
  className?: string;
}

/** Shared editorial heading for every daylight workspace. See design.md. */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title, eyebrow, description, actions, image, dense = false, className = '',
}) => {
  const titleId = useId();
  return (
    <header className={['workspace-heading', dense ? 'workspace-heading-dense' : '', className].join(' ')} aria-labelledby={titleId}>
      <div className="workspace-heading-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId}>{title}</h1>
        {description && <div className="workspace-description">{description}</div>}
      </div>
      {actions && <div className="workspace-heading-actions">{actions}</div>}
      {image && !actions && <img className="workspace-heading-image" src={image} alt="" loading="lazy" />}
    </header>
  );
};
