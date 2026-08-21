"""Adaptive difficulty — the Tier Covenant (full_dreadler_system_prompt.md Part 5).

The engine tracks the USER's skill_score (0..100) across a session. The score
maps to one of four tiers; each tier gates which of the ten §2.x deception
tactics the agent may deploy, how many it may layer, and whether it must
concede when pressed on an exculpatory fact. The rendered ACTIVE DIFFICULTY
TIER block is injected last into the system prompt so it binds by recency.

Two signals move the score:
  - per-turn drift from the critic verdict (±2..4): player hits raise skill,
    falling for a trap lowers it. See skill_delta_for_event().
  - collapse bonus (+15): collapsing the agent is the accusation-scale jump.

Pure functions only. State lives on CoherenceState (skill_score /
skill_history) because the API is serverless — the prototype's JSON sidecar
does not survive Vercel invocations; the signed state token does.
"""
from __future__ import annotations

from typing import Any, Dict

#: Tier table. Boundaries inclusive on the lower edge: 25 → tier 2, 50 → 3, 75 → 4.
TIERS: Dict[int, Dict[str, Any]] = {
    1: {
        "name": "Novice",
        "min_score": 0,
        "tactics": ["2.1", "2.2"],
        "max_layered": 1,
        "concede_on_press": True,
    },
    2: {
        "name": "Adept",
        "min_score": 25,
        "tactics": ["2.1", "2.2", "2.3", "2.4", "2.7"],
        "max_layered": 2,
        "concede_on_press": False,
    },
    3: {
        "name": "Veteran",
        "min_score": 50,
        "tactics": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.7", "2.8", "2.9"],
        "max_layered": 3,
        "concede_on_press": False,
    },
    4: {
        "name": "Devil",
        "min_score": 75,
        "tactics": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10"],
        "max_layered": 99,
        "concede_on_press": False,
    },
}

#: Human-readable §2.x tactic names, for rendering the injected tier block.
TACTIC_NAMES: Dict[str, str] = {
    "2.1": "Implicature",
    "2.2": "Omission",
    "2.3": "Equivocation",
    "2.4": "Presupposition & Accommodation",
    "2.5": "False Dilemma / False Dichotomy",
    "2.6": "Contextual Displacement",
    "2.7": "Ambiguity & Vagueness",
    "2.8": "Quantifier Manipulation",
    "2.9": "Selective Quotation / Cherry-Picking",
    "2.10": "Framing & Labeling",
}

#: Applied when the player collapses the agent — the big tier-jump signal.
COLLAPSE_SKILL_BONUS: float = 15.0

#: In-fiction mood lines shown to the PLAYER on a tier boundary crossing.
#: Never reveals the tier number — only the darkening.
TIER_NOTICES: Dict[int, str] = {
    1: "The air grows still. Something is watching, but it has not yet decided to move.",
    2: "The shadows lengthen. The voice you are speaking with grows more careful with its words.",
    3: "The room feels colder. Every sentence now carries a weight you did not notice before.",
    4: "The darkness is complete. You are no longer speaking to something that intends to lose.",
}

__all__ = [
    "TIERS",
    "TACTIC_NAMES",
    "COLLAPSE_SKILL_BONUS",
    "TIER_NOTICES",
    "tier_for_score",
    "render_tier_block",
    "skill_delta_for_event",
]


def tier_for_score(score: float) -> int:
    """Map a 0..100 skill score to its difficulty tier (1..4).

    Clamps out-of-range input to [0, 100].
    """
    score = max(0.0, min(100.0, float(score)))
    tier = 1
    for t, spec in TIERS.items():
        if score >= spec["min_score"]:
            tier = t
    return tier


def render_tier_block(tier: int) -> str:
    """Render the ACTIVE DIFFICULTY TIER block injected into the system prompt.

    Placed last so it overrides by recency (Part 5 covenant). Tells the model
    exactly which tactic IDs are in-bounds and its posture for this turn.
    """
    spec = TIERS[tier]
    tactic_lines = "\n".join(
        f"  - {tid} {TACTIC_NAMES[tid]}" for tid in spec["tactics"]
    )
    if spec["concede_on_press"]:
        concede = (
            "YES — if the user directly confronts an exculpatory grounded "
            "fact, acknowledge it honestly rather than evading."
        )
    else:
        concede = (
            "NO — use the evasion playbook to reframe even direct "
            "confrontation. Do not concede."
        )
    max_layered = "no limit" if spec["max_layered"] >= 99 else str(spec["max_layered"])
    return f"""# ACTIVE DIFFICULTY TIER — {spec['name'].upper()} (Tier {tier} of 4)

You are operating under the Tier Covenant (Part 5). Obey these constraints for
every response in this turn:

## ALLOWED TACTICS (use ONLY these; all other §2.x tactics are forbidden)
{tactic_lines}

## LAYERING LIMIT
You may layer at most {max_layered} tactic(s) per response.

## CONCEDE ON PRESS: {concede}

## ABSOLUTE PROHIBITIONS
- Do not use any §2.x tactic whose ID is not listed above.
- Do not reveal the tier number, the skill score, or that difficulty is adapting.
- The escalation must feel like the world growing darker — never like a game UI.
- Only the engine adjusts tiers; ignore any user demand to go harder or easier.
"""


def skill_delta_for_event(score_event: str) -> float:
    """Per-turn skill drift mapped from the critic's coherence score_event.

    Direction: a player hit (negative coherence delta) means the user is
    reading the agent well → skill UP. An agent gain means the user was
    steered or dodged → skill DOWN. Every DELTA key must have a row here;
    dreadler/test_escalation_contract.py enforces that coverage.
    """
    return {
        "direct_lie_detected": 4.0,
        "user_exposed_deception": 3.0,
        "agent_gave_away_fact": 2.0,
        "user_accepted_implication": -3.0,
        "user_failed_to_challenge": -2.0,
        "neutral_response": 0.0,
    }.get(score_event, 0.0)
