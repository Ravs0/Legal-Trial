import React from 'react';
import { PageHeader } from './PageHeader';

interface RoomBannerProps {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  dense?: boolean;
  className?: string;
}

export const RoomBanner: React.FC<RoomBannerProps> = ({
  image, eyebrow, title, subtitle, trailing, dense = false, className,
}) => <PageHeader image={image} eyebrow={eyebrow} title={title} description={subtitle} actions={trailing} dense={dense} className={className} />;

export const RoomTabs: React.FC<{
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => (
  <div role="tablist" aria-label="Workspace views" className={'room-tabs ' + className}>
    {tabs.map((tab, index) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        tabIndex={active === tab.id ? 0 : -1}
        onClick={() => onChange(tab.id)}
        onKeyDown={(event) => {
          let target = index;
          if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = tabs.length - 1;
          else return;
          event.preventDefault();
          onChange(tabs[target].id);
          const controls = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          controls?.[target]?.focus();
        }}
      >{tab.label}</button>
    ))}
  </div>
);

export const RoomStepper: React.FC<{
  steps: { id: string; label: string }[];
  currentIndex: number;
  className?: string;
}> = ({ steps, currentIndex, className = '' }) => (
  <ol className={'room-stepper ' + className} aria-label="Progress">
    {steps.map((step, index) => (
      <li key={step.id} aria-current={index === currentIndex ? 'step' : undefined} className={index <= currentIndex ? 'is-reached' : ''}>
        <span className="step-number">{index < currentIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <span className="step-label">{step.label}</span>
      </li>
    ))}
  </ol>
);

export const RoomFrame: React.FC<{
  children: React.ReactNode;
  className?: string;
  pattern?: 'grid' | 'dots' | 'lines' | 'none';
}> = ({ children, className = '' }) => (
  <div className={'relative flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden ' + className}>{children}</div>
);
