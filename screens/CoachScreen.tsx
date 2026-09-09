import React, { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { LearnerProfileCard } from "../components/LearnerProfileCard";
import { DrillCards } from "../components/DrillCards";
import { ROUTES } from "../routes";
import { loadProfile } from "../services/learnerProfile";
import { pickEvening, type Attempt, type Card as DrillCard } from "../services/curriculum";
import { loadCompletedSessions, readGenericState } from "../services/storageService";

const clampTen = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
};

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const CoachScreen: React.FC = () => {
  const navigate = useNavigate();
  const profile = useMemo(() => loadProfile(), []);
  const sessions = useMemo(() => loadCompletedSessions(), []);
  const cards = useMemo(() => readGenericState<DrillCard[]>("lexforge:drill-cards") ?? [], []);
  const attempts = useMemo(() => readGenericState<Attempt[]>("lexforge:drill-attempts") ?? [], []);
  const picks = useMemo(() => pickEvening(cards, attempts, Date.now()), [cards, attempts]);
  const scores = useMemo(
    () => sessions.filter((s) => s.performance).slice(0, 6).map((s) => clampTen(s.performance?.overallScore)),
    [sessions],
  );
  const trend =
    scores.length > 1
      ? scores[0] > scores[1] + 0.15
        ? "Up vs last"
        : scores[0] < scores[1] - 0.15
          ? "Down vs last"
          : "Flat vs last"
      : "No trend yet";
  const goPractice = useCallback(() => navigate(ROUTES.PRACTICE), [navigate]);

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-brand-bg-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Coach</p>
          <h1 className="mt-1 text-2xl font-serif font-semibold text-brand-text-primary">Evening plan</h1>
          <p className="mt-1 text-[13px] text-brand-text-secondary">Profile, drills and trend in one place.</p>
        </div>
        <LearnerProfileCard profile={profile} />
        <Card title={`Evening drills · ${picks.length}`}>
          <DrillCards drills={picks} attempts={attempts} cards={cards} onStart={goPractice} />
        </Card>
        <Card title="Recent scores">
          {scores.length === 0 ? (
            <p className="text-[13px] text-brand-text-secondary">No scored sessions yet. Scores appear after review.</p>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xl font-mono tabular-nums text-brand-text-primary">{scores.map(fmt).join(" , ")}</p>
                <p className="mt-1 text-[12px] text-brand-text-secondary">{trend} · newest first, out of 10</p>
              </div>
              <div className="flex items-end gap-1 h-10" aria-label={`Recent scores: ${scores.map(fmt).join(", ")}`}>
                {[...scores].reverse().map((s, i) => (
                  <div
                    key={`${s}-${i}`}
                    title={`${fmt(s)} / 10`}
                    className={i === scores.length - 1 ? "w-2.5 bg-brand-text-primary/70" : "w-2.5 bg-brand-text-primary/20"}
                    style={{ height: Math.max(8, Math.round((s / 10) * 40)) }}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="primary" onClick={goPractice}>
            Start practice
          </Button>
          <Button variant="outline" onClick={() => navigate(ROUTES.ANALYSIS)}>
            Review scores
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CoachScreen;
