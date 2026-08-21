"""Contract self-check: Tier Covenant (Part 5) escalation ↔ CoherenceState.

Covers: tier boundaries, tier-block rendering (tactic whitelist / layering /
concede), skill drift coverage for every critic score_event, skill ledger
clamping, and collapse-bonus escalation.

Pure stdlib. No network. No pytest required.

Run:
    python dreadler/test_escalation_contract.py
    # or from repo root:
    python -m dreadler.test_escalation_contract
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dreadler.escalation import (  # noqa: E402
    COLLAPSE_SKILL_BONUS,
    TIERS,
    TACTIC_NAMES,
    render_tier_block,
    skill_delta_for_event,
    tier_for_score,
)
from dreadler.state import DELTA, CoherenceState  # noqa: E402


def test_tier_boundaries():
    assert tier_for_score(0) == 1
    assert tier_for_score(24.9) == 1
    assert tier_for_score(25) == 2
    assert tier_for_score(49.9) == 2
    assert tier_for_score(50) == 3
    assert tier_for_score(74.9) == 3
    assert tier_for_score(75) == 4
    assert tier_for_score(100) == 4


def test_tier_clamps_out_of_range():
    assert tier_for_score(-10) == 1
    assert tier_for_score(999) == 4


def test_every_tier_tactics_exist_in_taxonomy():
    for tier, spec in TIERS.items():
        assert spec["tactics"], f"tier {tier} has no tactics"
        for tid in spec["tactics"]:
            assert tid in TACTIC_NAMES, f"tier {tier} references unknown tactic {tid}"
    # Tiers unlock strictly more tactics as they rise.
    for lower, higher in ((1, 2), (2, 3), (3, 4)):
        assert set(TIERS[lower]["tactics"]) <= set(TIERS[higher]["tactics"])


def test_tier_block_renders_whitelist_layering_concede():
    block = render_tier_block(1)
    assert "TIER 1 OF 4" in block.upper()
    for tid in TIERS[1]["tactics"]:
        assert tid in block
    assert "at most 1 tactic(s)" in block
    assert "CONCEDE ON PRESS: YES" in block

    devil = render_tier_block(4)
    assert "no limit" in devil
    assert "CONCEDE ON PRESS: NO" in devil
    assert "2.10" in devil


def test_skill_drift_covers_every_score_event():
    """Every critic score_event must have a skill mapping — no silent zeros."""
    mapping = {
        "direct_lie_detected": 4.0,
        "user_exposed_deception": 3.0,
        "agent_gave_away_fact": 2.0,
        "user_accepted_implication": -3.0,
        "user_failed_to_challenge": -2.0,
        "neutral_response": 0.0,
    }
    for event, expected in mapping.items():
        assert skill_delta_for_event(event) == expected, f"drift wrong for {event}"


def test_skill_drift_direction_matches_coherence():
    """A player hit (negative coherence delta) must RAISE skill; agent gain lowers."""
    for event, coherence_delta in DELTA.items():
        skill_delta = skill_delta_for_event(event)
        if coherence_delta < 0:
            assert skill_delta > 0, f"{event} is a player hit but does not raise skill"
        elif coherence_delta > 0:
            assert skill_delta < 0, f"{event} is an agent gain but does not lower skill"


def test_apply_skill_delta_clamps_and_records():
    state = CoherenceState(skill_score=99.0)
    summary = state.apply_skill_delta(4.0, "critic:direct_lie_detected")
    assert state.skill_score == 100.0  # clamped, not 103
    assert summary["new_score"] == 100.0
    assert summary["tier_changed"] is False
    assert summary["notice"] is None
    assert state.skill_history[-1]["reason"] == "critic:direct_lie_detected"
    assert state.skill_history[-1]["tier_after"] == 4

    low = CoherenceState(skill_score=2.0)
    low.apply_skill_delta(-50.0, "test floor")
    assert low.skill_score == 0.0
    assert low.tier == 1


def test_tier_crossing_emits_infiction_notice_only():
    state = CoherenceState(skill_score=20.0)
    summary = state.apply_skill_delta(10.0, "crossing to adept")
    assert summary["tier_changed"] is True
    assert summary["old_tier"] == 1 and summary["new_tier"] == 2
    # Notice carries mood, never the number or the word "tier".
    notice = summary["notice"] or ""
    assert notice and "tier" not in notice.lower()
    assert not any(ch.isdigit() for ch in notice)


def test_collapse_bonus_crosses_tiers():
    state = CoherenceState(skill_score=15.0)
    before = state.tier
    summary = state.apply_collapse_bonus()
    assert summary["delta"] == COLLAPSE_SKILL_BONUS
    assert state.skill_score == 15.0 + COLLAPSE_SKILL_BONUS
    assert summary["new_tier"] > before or state.skill_score < 25  # always progresses or clamps at floor


def test_default_skill_starts_adept():
    state = CoherenceState()
    assert state.skill_score == 25.0
    assert state.tier == 2


def main() -> int:
    fns = [
        v for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    passed = failed = 0
    print("dreadler tier covenant ↔ state contract")
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {fn.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {fn.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed, {len(fns)} total")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
