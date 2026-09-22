import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { LearnerProfileCard } from "../components/LearnerProfileCard";
import { DrillCards } from "../components/DrillCards";
import { ROUTES } from "../routes";
import { loadProfile } from "../services/learnerProfile";
import { pickEvening, type Attempt, type Card as DrillCard } from "../services/curriculum";
import { loadCompletedSessions, readGenericState } from "../services/storageService";
import {
  CHAIN_VERDICT_DISCLAIMER,
  CHAIN_VERDICT_EVENT,
  chainConfidence,
  readChainVerdicts,
  type ChainVerdict,
} from "./practice/PracticeArena";

const clampTen = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
};

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtPct = (x: number): string => `${Math.round(x * 100)}%`;

/** B15 — review-queue row: human_review states, never rendered as auto-pass. */
const VerdictQueueRow: React.FC<{ verdict: ChainVerdict }> = ({ verdict }) => {
  const review = verdict.decision === "human_review";
  const conf = chainConfidence(verdict);
  return (
    <li
      className={`rounded-lg border p-3 ${
        review ? "border-brand-error/30 bg-brand-accent-muted" : "border-brand-text-primary/15 bg-brand-bg-secondary/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-brand-text-primary">
          {verdict.drillId ?? "Drill verdict"} · {fmtPct(verdict.score)}
        </p>
        {review ? (
          <span className="rounded-sm border border-brand-error/40 bg-brand-accent-muted px-2 py-0.5 text-[10px] font-semibold text-brand-error">
            Queued for human review
          </span>
        ) : (
          <span className="rounded-sm border border-brand-text-primary/15 bg-brand-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-brand-text-secondary">
            Auto
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] font-mono text-brand-text-secondary">
        {verdict.voters
          .map((v) =>
            typeof v.score === "number" && Number.isFinite(v.score)
              ? `${v.source} ${fmtPct(v.score)}`
              : `${v.source} unavailable${v.error ? ` (${v.error})` : ""}`,
          )
          .join(" · ")}
        {conf !== null ? ` · confidence ${fmtPct(conf)}` : ""}
      </p>
      {verdict.code && (
        <p className="mt-1 text-[10px] font-mono text-brand-error/80">gate: {verdict.code}</p>
      )}
      {review && (
        <p className="mt-1 text-[11px] leading-relaxed text-brand-text-primary">
          Not auto-passed — a reviewer decides the outcome; this drill stays open until then.
        </p>
      )}
    </li>
  );
};

const CoachScreen: React.FC = () => {
  const navigate = useNavigate();
  const profile = useMemo(() => loadProfile(), []);
  const sessions = useMemo(() => loadCompletedSessions(), []);
  const cards = useMemo(() => readGenericState<DrillCard[]>("lexforge:drill-cards") ?? [], []);
  const attempts = useMemo(() => readGenericState<Attempt[]>("lexforge:drill-attempts") ?? [], []);
  const picks = useMemo(() => pickEvening(cards, attempts, Date.now()), [cards, attempts]);
  /** B15 — chain verdicts (UI only: localStorage + live event; no API calls). */
  const [verdicts, setVerdicts] = useState<ChainVerdict[]>(() => {
    try {
      return readChainVerdicts();
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const onVerdict = () => {
      try {
        setVerdicts(readChainVerdicts());
      } catch {
        /* keep last */
      }
    };
    window.addEventListener(CHAIN_VERDICT_EVENT, onVerdict);
    return () => window.removeEventListener(CHAIN_VERDICT_EVENT, onVerdict);
  }, []);
  const queue = useMemo(() => verdicts.filter((v) => v.decision === "human_review"), [verdicts]);
  const latestAutoByDrill = useMemo(() => {
    const seen = new Set<string>();
    const out: ChainVerdict[] = [];
    for (const v of verdicts) {
      if (v.decision === "human_review" || !v.drillId || seen.has(v.drillId)) continue;
      seen.add(v.drillId);
      out.push(v);
    }
    return out.slice(0, 4);
  }, [verdicts]);
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
        <Card title={queue.length > 0 ? `Chain verdicts · ${queue.length} in review` : "Chain verdicts"}>
          {verdicts.length === 0 ? (
            <div>
              <p className="text-[13px] text-brand-text-secondary">
                No chain verdicts yet. Drill turns scored by the chain appear here with score, voters, and decision.
              </p>
              <p className="mt-2 text-[11px] font-mono text-brand-text-secondary/60 leading-relaxed">
                {CHAIN_VERDICT_DISCLAIMER}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-brand-error">Review queue — not auto-passed</p>
                  <ul className="mt-2 space-y-2" aria-label="Review queue">
                    {queue.map((v, i) => (
                      <VerdictQueueRow key={`${v.drillId ?? "q"}-${v.at ?? i}`} verdict={v} />
                    ))}
                  </ul>
                </div>
              )}
              {latestAutoByDrill.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Latest auto verdicts</p>
                  <ul className="mt-2 space-y-2" aria-label="Latest auto verdicts">
                    {latestAutoByDrill.map((v, i) => (
                      <VerdictQueueRow key={`${v.drillId ?? "a"}-${v.at ?? i}`} verdict={v} />
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] font-mono text-brand-text-secondary/60 leading-relaxed">
                {CHAIN_VERDICT_DISCLAIMER}
              </p>
            </div>
          )}
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
