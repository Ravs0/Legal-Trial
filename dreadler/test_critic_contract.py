"""Contract self-check: critic score_event vocabulary ↔ state.DELTA.

The engine does:
    state.apply_delta(critic_result["score_event"], ...)

apply_delta raises ValueError on unknown keys. The critic prompt documents the
allowed score_event strings; DELTA must list exactly those keys (or a superset
with no prompt orphans) so a valid critic JSON never blows up a turn.

Pure stdlib. No network. No pytest required.

Run:
    python dreadler/test_critic_contract.py
    # or from repo root with package on path:
    python -m dreadler.test_critic_contract
"""
from __future__ import annotations

import os
import re
import sys

# Allow `python dreadler/test_critic_contract.py` from repo root.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dreadler.critic import CriticLayer  # noqa: E402
from dreadler.state import DELTA, CoherenceState  # noqa: E402


# Canonical score_event set — must stay in lockstep with:
#   1) dreadler/state.py DELTA keys
#   2) dreadler/critic.py _build_prompt score_event bullet list
#   3) dreadler/engine.py default critic_result["score_event"]
CANONICAL_SCORE_EVENTS: frozenset[str] = frozenset({
    "user_accepted_implication",
    "user_failed_to_challenge",
    "direct_lie_detected",
    "user_exposed_deception",
    "agent_gave_away_fact",
    "neutral_response",
})

# Sign convention fixture (see state.py module docstring):
#   positive → agent recovered ground (score up)
#   negative → player scored a hit (score down)
#   zero     → neutral
EXPECTED_SIGNS: dict[str, str] = {
    "user_accepted_implication": "positive",
    "user_failed_to_challenge": "positive",
    "direct_lie_detected": "negative",
    "user_exposed_deception": "negative",
    "agent_gave_away_fact": "negative",
    "neutral_response": "zero",
}

REQUIRED_CRITIC_KEYS: frozenset[str] = frozenset({
    "is_direct_lie",
    "deception_succeeded",
    "user_exposed",
    "score_event",
    "tactic_used",
    "explanation",
})


def _score_events_in_prompt(prompt: str) -> set[str]:
    """Pull score_event token names listed with '* name —' in the critic prompt."""
    # Critic prompt format:
    #   * user_accepted_implication — ...
    found = set(re.findall(r"\*\s+([a-z_]+)\s+—", prompt))
    # Only keep names that look like score events (overlap with canonical or DELTA).
    known = set(DELTA.keys()) | set(CANONICAL_SCORE_EVENTS)
    return {name for name in found if name in known or name.endswith("_response")
            or "lie" in name or "user_" in name or "agent_" in name}


def test_delta_keys_match_canonical():
    assert set(DELTA.keys()) == CANONICAL_SCORE_EVENTS, (
        f"DELTA keys {sorted(DELTA)} != canonical {sorted(CANONICAL_SCORE_EVENTS)}"
    )


def test_critic_prompt_lists_every_delta_key():
    critic = CriticLayer()
    prompt = critic._build_prompt(
        grounded_facts=["fact A"],
        agent_response="Why did you leave?",
        user_input="I was at home.",
        dialogue_history=[],
    )
    for key in DELTA:
        assert key in prompt, f"score_event {key!r} missing from critic prompt"


def test_critic_prompt_extracted_events_equal_delta():
    critic = CriticLayer()
    prompt = critic._build_prompt(
        grounded_facts=["fact A"],
        agent_response="Challenge.",
        user_input="Reply.",
    )
    extracted = _score_events_in_prompt(prompt)
    assert extracted == set(DELTA.keys()), (
        f"prompt events {sorted(extracted)} != DELTA {sorted(DELTA)}"
    )


def test_delta_sign_convention():
    for key, kind in EXPECTED_SIGNS.items():
        val = DELTA[key]
        if kind == "positive":
            assert val > 0, f"{key} should raise coherence, got {val}"
        elif kind == "negative":
            assert val < 0, f"{key} should drop coherence, got {val}"
        else:
            assert val == 0, f"{key} should be neutral, got {val}"


def test_apply_delta_accepts_every_score_event():
    """Every critic-documented score_event must be apply_delta-safe."""
    for key, expected_delta in DELTA.items():
        state = CoherenceState(score=50)
        new = state.apply_delta(key, note="contract self-check")
        assert new == max(0, min(100, 50 + expected_delta))
        assert state.score_history[-1]["event"] == key
        assert state.score_history[-1]["delta"] == expected_delta


def test_apply_delta_rejects_unknown_score_event():
    """Mirrors production risk: unknown LLM score_event → ValueError mid-turn."""
    state = CoherenceState(score=50)
    try:
        state.apply_delta("not_a_real_event")
        raise AssertionError("expected ValueError for unknown event key")
    except ValueError as exc:
        assert "Unknown event key" in str(exc)


def test_default_result_is_delta_safe():
    default = CriticLayer()._default_result()
    assert REQUIRED_CRITIC_KEYS <= set(default.keys())
    assert default["score_event"] in DELTA
    # Applying the default must not raise and must leave score unchanged.
    state = CoherenceState(score=72)
    new = state.apply_delta(default["score_event"], default.get("explanation", ""))
    assert new == 72


def test_engine_default_score_event_is_delta_safe():
    """Opening-turn default in engine.turn uses neutral_response."""
    assert "neutral_response" in DELTA
    assert DELTA["neutral_response"] == 0


def test_clamp_extremes_for_player_and_agent_hits():
    """Hardest player hit and strongest agent gain still clamp to [0, 100]."""
    hard_hit = min(DELTA.values())  # most negative
    hard_gain = max(DELTA.values())  # most positive

    low = CoherenceState(score=5)
    after_hit = low.apply_delta(
        next(k for k, v in DELTA.items() if v == hard_hit)
    )
    assert 0 <= after_hit <= 100

    high = CoherenceState(score=98)
    after_gain = high.apply_delta(
        next(k for k, v in DELTA.items() if v == hard_gain)
    )
    assert 0 <= after_gain <= 100


def main() -> int:
    fns = [
        v for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    passed = failed = 0
    print("dreadler critic ↔ DELTA contract")
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
