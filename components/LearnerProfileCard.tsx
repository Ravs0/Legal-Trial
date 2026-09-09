import React from 'react';
import { Card } from './Card';
import type { LearnerProfile } from '../services/learnerProfile';

interface LearnerProfileCardProps {
  profile: LearnerProfile;
}

const splitEntries = (value: string): string[] =>
  value.split('§').map((t) => t.trim()).filter(Boolean);

const Chips: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <span
        key={item}
        className="rounded border border-brand-border bg-brand-bg-tertiary px-2 py-0.5 text-[12px] text-brand-text-primary"
      >
        {item}
      </span>
    ))}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-[11px] font-medium uppercase tracking-wide text-brand-text-secondary">{title}</h4>
    <div className="mt-1.5">{children}</div>
  </div>
);

const NoneNote: React.FC = () => (
  <p className="text-[12px] text-brand-text-secondary">None recorded yet.</p>
);

export const LearnerProfileCard: React.FC<LearnerProfileCardProps> = ({ profile }) => {
  const strengths = splitEntries(profile.strengths);
  const weaknesses = splitEntries(profile.weaknesses);
  const vocab = splitEntries(profile.vocab);
  const history = splitEntries(profile.judgeHistory);
  const isNew = strengths.length + weaknesses.length + vocab.length + history.length === 0;

  if (isNew) {
    return (
      <Card title="Learner ledger">
        <p className="text-[13px] text-brand-text-secondary">Complete a trial to build your ledger.</p>
      </Card>
    );
  }

  return (
    <Card title="Learner ledger">
      <div className="space-y-4">
        <Section title="Strengths">
          {strengths.length ? <Chips items={strengths} /> : <NoneNote />}
        </Section>
        <Section title="Weaknesses">
          {weaknesses.length ? <Chips items={weaknesses} /> : <NoneNote />}
        </Section>
        <Section title="Vocabulary gaps">
          {vocab.length ? <Chips items={vocab} /> : <NoneNote />}
        </Section>
        <Section title="Judge history">
          {history.length ? (
            <ul className="divide-y divide-brand-border rounded border border-brand-border bg-brand-bg-secondary">
              {history.map((entry) => (
                <li key={entry} className="px-2.5 py-1.5 text-[12px] text-brand-text-primary">
                  {entry}
                </li>
              ))}
            </ul>
          ) : (
            <NoneNote />
          )}
        </Section>
      </div>
    </Card>
  );
};
