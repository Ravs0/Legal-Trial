import React, { useMemo } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Attempt, Card as ReviewCard, Drill, isUnlocked } from '../services/curriculum';

interface DrillCardsProps {
  drills: Drill[];
  attempts: Attempt[];
  cards: ReviewCard[];
  onStart: (drill: Drill) => void;
}

export const DrillCards: React.FC<DrillCardsProps> = ({ drills, attempts, cards, onStart }) => {
  const dueIds = useMemo(() => {
    const now = Date.now();
    return new Set(cards.filter((c) => c.dueAt <= now).map((c) => c.drillId));
  }, [cards]);

  const weakestSkill = useMemo(() => {
    if (attempts.length === 0) return null;
    const totals = new Map<string, { sum: number; n: number }>();
    for (const a of attempts) {
      const e = totals.get(a.skill) ?? { sum: 0, n: 0 };
      e.sum += a.score;
      e.n += 1;
      totals.set(a.skill, e);
    }
    let weak: string | null = null;
    let low = Infinity;
    for (const [skill, v] of totals) {
      const avg = v.sum / v.n;
      if (avg < low) {
        low = avg;
        weak = skill;
      }
    }
    return weak;
  }, [attempts]);

  if (drills.length === 0) {
    return <p className="text-[13px] text-brand-text-secondary">No drills assigned yet.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Drill list">
      {drills.map((d) => {
        const unlocked = isUnlocked(d, attempts);
        const due = dueIds.has(d.id);
        const weak = weakestSkill !== null && d.skill === weakestSkill;
        return (
          <Card
            key={d.id}
            title={`${d.skill} Level ${d.level}`}
            actions={
              <span className="rounded-sm border border-brand-border bg-brand-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-brand-text-secondary">
                {unlocked ? 'Unlocked' : 'Locked'}
              </span>
            }
          >
            <p className="text-[13px] text-brand-text-primary">{d.prompt}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-sm border border-brand-border bg-brand-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-brand-text-primary">
                {d.skill}
              </span>
              <span className="rounded-sm border border-brand-border px-2 py-0.5 text-[11px] text-brand-text-secondary">
                Level {d.level}
              </span>
              {d.timed && (
                <span className="rounded-sm border border-brand-border px-2 py-0.5 text-[11px] text-brand-text-secondary">
                  Timed
                </span>
              )}
              {due && (
                <span className="rounded-sm border border-brand-error/40 bg-brand-accent-muted px-2 py-0.5 text-[11px] font-medium text-brand-error">
                  Due
                </span>
              )}
              {weak && (
                <span className="rounded-sm border border-brand-border bg-brand-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-brand-amber">
                  Focus skill
                </span>
              )}
            </div>
            <div className="mt-3">
              <Button size="sm" disabled={!unlocked} onClick={() => onStart(d)}>
                {unlocked ? 'Start' : 'Locked'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
