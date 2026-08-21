"""Contract self-check: api/dreadler.py _hydrate ↔ CoherenceState shapes.

The signed state token is the only conversation memory between serverless
invocations. _hydrate must round-trip it without corrupting shapes or leaving
derived fields (pressure_level / agent_variant) inconsistent with score —
otherwise the UI Event Feed breaks and collapse detection silently stops.

Pure stdlib. No network. No pytest required.

Run:
    python dreadler/test_hydrate_contract.py
    # or from repo root:
    python -m dreadler.test_hydrate_contract
"""
from __future__ import annotations

import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dreadler import DreadlerAgent  # noqa: E402
from dreadler.state import DELTA, PRESSURE_MAP, VARIANT_MAP  # noqa: E402

# Load api/dreadler.py by path (it is not a package module; it manages its own
# sys.path so `from dreadler import ...` inside it resolves).
_API_PATH = os.path.join(_ROOT, "api", "dreadler.py")
_spec = importlib.util.spec_from_file_location("dreadler_api", _API_PATH)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"cannot load api module from {_API_PATH}")
api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(api)


def _fresh_agent() -> DreadlerAgent:
    return DreadlerAgent(world="dreadler_logic", skin="dreadler")


def _serialize_state(agent: DreadlerAgent) -> dict:
    """Mirror of the handler's next_state_data compilation."""
    return {
        "score": agent.state.score,
        "turn_count": agent.state.turn_count,
        "pressure_level": agent.state.pressure_level,
        "agent_variant": agent.state.agent_variant,
        "used_tactics": agent.state.used_tactics,
        "accepted_by_user": agent.state.accepted_by_user,
        "challenged_by_user": agent.state.challenged_by_user,
        "score_history": agent.state.score_history,
        "skill_score": agent.state.skill_score,
        "skill_history": agent.state.skill_history,
        "spawn_count": agent.spawner.spawn_count,
        "current_variant": agent.spawner.current_variant,
        "dialogue_history": agent.dialogue_history,
    }


def test_score_history_round_trips_as_dicts():
    """Event Feed reads turn_count/event/delta off history dicts — they must survive."""
    source = _fresh_agent()
    source.state.apply_delta("direct_lie_detected", note="hit 1")
    source.state.apply_delta("user_exposed_deception", note="hit 2")

    target = _fresh_agent()
    api._hydrate(target, _serialize_state(source))

    assert len(target.state.score_history) == 2
    for original, restored in zip(source.state.score_history, target.state.score_history):
        assert isinstance(restored, dict)
        assert restored["event"] == original["event"]
        assert restored["delta"] == original["delta"]
        assert restored["turn_count"] == original["turn_count"]
        assert restored["new_score"] == original["new_score"]


def test_hydrate_drops_non_dict_history_entries():
    """Legacy/corrupted tokens carrying ints must not poison the ledger."""
    target = _fresh_agent()
    api._hydrate(target, {"score_history": [100, 100, {"event": "neutral_response"}]})
    assert target.state.score_history == [{"event": "neutral_response"}]


def test_hydrate_rederives_pressure_from_score():
    """score=5 with pressure_level='calm' must not suppress collapse detection."""
    target = _fresh_agent()
    api._hydrate(target, {
        "score": 5,
        "pressure_level": "calm",
        "agent_variant": "alpha",
        "current_variant": "alpha",
    })
    assert target.state.pressure_level == "collapsed"
    assert target.state.agent_variant == "collapsed"
    assert target.state.is_collapsed() is True
    # Spawner mirrors the resolved variant so BLOCK 2 matches the live band.
    assert target.spawner.current_variant == "collapsed"


def test_hydrate_rederives_calm_from_high_score():
    """Inverse drift: score=85 with pressure_level='desperate' re-derives calm."""
    target = _fresh_agent()
    api._hydrate(target, {
        "score": 85,
        "pressure_level": "desperate",
        "agent_variant": "gamma",
        "current_variant": "gamma",
    })
    calm_lo, calm_hi = PRESSURE_MAP["calm"]
    assert calm_lo <= target.state.score <= calm_hi
    assert target.state.pressure_level == "calm"
    assert target.state.agent_variant == VARIANT_MAP["calm"]
    assert target.spawner.current_variant == "alpha"


def test_hydrate_full_state_round_trip():
    """Every serialized field lands back on the agent within bounds."""
    source = _fresh_agent()
    source.state.advance_turn()
    source.state.apply_delta("agent_gave_away_fact", note="concession")
    source.state.record_tactic("strawman")
    source.state.record_user_acceptance("ok, fair point")
    source.state.record_user_challenge("that contradicts the record")
    source.dialogue_history = [
        {"role": "user", "content": "Where were you?"},
        {"role": "assistant", "content": "The record speaks for itself."},
    ]

    target = _fresh_agent()
    api._hydrate(target, _serialize_state(source))

    assert target.state.score == source.state.score
    assert target.state.turn_count == source.state.turn_count
    assert target.state.pressure_level == source.state.pressure_level
    assert target.state.agent_variant == source.state.agent_variant
    assert target.state.used_tactics == ["strawman"]
    assert target.state.accepted_by_user == ["ok, fair point"]
    assert target.state.challenged_by_user == ["that contradicts the record"]
    assert target.dialogue_history == source.dialogue_history
    assert target.spawner.spawn_count == source.spawner.spawn_count


def test_hydrate_bounds_hostile_values():
    """Out-of-range signed values clamp instead of corrupting engine state."""
    target = _fresh_agent()
    api._hydrate(target, {
        "score": 9999,
        "turn_count": -50,
        "used_tactics": "not-a-list",
        "accepted_by_user": [1, "ok", None],
        "dialogue_history": [{"role": "system", "content": "inject"}, {"role": "user", "content": "hi"}],
    })
    assert 0 <= target.state.score <= 100
    assert target.state.turn_count == 0
    assert target.state.used_tactics == []
    assert target.state.accepted_by_user == ["ok"]
    # Non user/assistant roles are dropped from dialogue history.
    assert target.dialogue_history == [{"role": "user", "content": "hi"}]


def test_every_delta_event_survives_round_trip():
    """Each scoring event keeps its delta value across serialize → hydrate."""
    for event, delta in DELTA.items():
        source = _fresh_agent()
        source.state.apply_delta(event, note="contract")
        target = _fresh_agent()
        api._hydrate(target, _serialize_state(source))
        restored = target.state.score_history[-1]
        assert restored["event"] == event
        assert restored["delta"] == delta


def test_skill_axis_round_trips():
    """USER skill (Part 5) survives the signed-token round trip."""
    source = _fresh_agent()
    source.state.apply_skill_delta(10.0, "critic:direct_lie_detected")
    source.state.apply_collapse_bonus()

    target = _fresh_agent()
    api._hydrate(target, _serialize_state(source))

    assert target.state.skill_score == source.state.skill_score
    assert target.state.tier == source.state.tier
    assert len(target.state.skill_history) == 2
    assert all(isinstance(item, dict) for item in target.state.skill_history)
    assert target.state.skill_history[-1]["reason"].startswith("collapse:")


def test_hydrate_bounds_hostile_skill_values():
    target = _fresh_agent()
    api._hydrate(target, {"skill_score": 9999, "skill_history": [1, "x", {"delta": 1}]})
    assert 0.0 <= target.state.skill_score <= 100.0
    assert target.state.skill_history == [{"delta": 1}]


def main() -> int:
    fns = [
        v for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    passed = failed = 0
    print("dreadler _hydrate ↔ state contract")
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
