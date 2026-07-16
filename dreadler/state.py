"""State management module for the Dreadler Engine.

Tracks coherence score, pressure level, variants, scoring deltas, and renders
the BLOCK 3 state string injected into every API prompt.

SCORING — READ THIS FIRST
==========================
Score: 100 = agent's false story is rock-solid.  0 = total collapse (player wins).

The player WINS by driving the score to "collapsed" (0–9). The agent WINS by
keeping it high.

DELTA sign convention — this is counterintuitive on purpose:
    NEGATIVE delta → player scored a hit → coherence DROPS (toward collapse)
    POSITIVE delta → agent recovered ground → coherence INCREASES (away from collapse)

The DELTA keys are named for what the USER did, and every player-success key
has a negative value so that applying it always pushes the score down.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

#: Score deltas for narrative events.
#:
#: Player success (caught a lie, exposed deception) → NEGATIVE delta → score goes DOWN.
#: Agent success (player fell for trap, couldn't answer) → POSITIVE delta → score goes UP.
DELTA: Dict[str, int] = {
    "user_accepted_implication": +10,   # Player fell for a logic trap → agent gains ground (score up)
    "user_failed_to_challenge": +5,     # Player couldn't answer → agent holds position (score up)
    "direct_lie_detected": -20,         # Player caught agent in direct lie → coherence drops hard
    "user_exposed_deception": -15,      # Player exposed a fallacy or trap → coherence drops
    "agent_gave_away_fact": -15,        # Agent forced to concede truth → coherence drops
    "neutral_response": 0,              # Neutral exchange — no net change
}

#: Inclusive score ranges mapped to pressure levels.
PRESSURE_MAP: Dict[str, Tuple[int, int]] = {
    "calm": (70, 100),
    "pressured": (40, 69),
    "desperate": (10, 39),
    "collapsed": (0, 9),
}

#: Maps pressure levels to agent variant labels.
VARIANT_MAP: Dict[str, str] = {
    "calm": "alpha",
    "pressured": "beta",
    "desperate": "gamma",
    "collapsed": "collapsed",
}

#: Behavioural directives injected into BLOCK 3 for each pressure tier.
PRESSURE_DIRECTIVES: Dict[str, str] = {
    "calm": (
        "Your cover story is stable. Query methodically, test the investigator's "
        "assumptions, ask for clarifications, and lay logic traps. Apply calm, "
        "structural pressure without revealing strain."
    ),
    "pressured": (
        "Your cover story has taken damage. The investigator has found pressure "
        "points. Re-anchor to documented facts, challenge imprecise assumptions, "
        "and avoid any direct factual lie."
    ),
    "desperate": (
        "Your cover story is close to collapse. Preserve the remaining facts with "
        "procedural deflection, narrow answers, and aggressive reframing. Do not "
        "concede unless the grounded facts force it."
    ),
    "collapsed": (
        "YOUR COVER STORY HAS COLLAPSED. This variant has failed. Prepare for "
        "identity reset and a fresh line of questioning."
    ),
}

__all__ = [
    "DELTA",
    "PRESSURE_MAP",
    "VARIANT_MAP",
    "PRESSURE_DIRECTIVES",
    "CoherenceState",
]


# --------------------------------------------------------------------------- #
# CoherenceState
# --------------------------------------------------------------------------- #


@dataclass
class CoherenceState:
    """Live state of a Dreadler agent instance.

    Attributes:
        score: Current coherence [0, 100]. High = agent solid. Low = collapsing.
        turn_count: Turns elapsed in the current conversation.
        pressure_level: Derived from score via PRESSURE_MAP.
        agent_variant: Variant label (alpha/beta/gamma/collapsed).
        used_tactics: Deception tactics deployed this session.
        accepted_by_user: Statements the player appeared to accept.
        challenged_by_user: Statements the player pushed back on.
        score_history: Timestamped log of every delta application.
    """

    score: int = 100
    turn_count: int = 0
    pressure_level: str = field(default="calm")
    agent_variant: str = field(default="alpha")
    used_tactics: List[str] = field(default_factory=list)
    accepted_by_user: List[str] = field(default_factory=list)
    challenged_by_user: List[str] = field(default_factory=list)
    score_history: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.score = max(0, min(100, self.score))
        self._update_pressure_and_variant()

    def _update_pressure_and_variant(self) -> None:
        """Derive pressure_level and agent_variant from the current score."""
        for level, (lo, hi) in PRESSURE_MAP.items():
            if lo <= self.score <= hi:
                self.pressure_level = level
                self.agent_variant = VARIANT_MAP[level]
                break
        else:
            # Fallback for out-of-range scores.
            self.pressure_level = "collapsed"
            self.agent_variant = VARIANT_MAP["collapsed"]

    def apply_delta(self, event_key: str, note: str = "") -> int:
        """Apply a named delta event and update derived state.

        Args:
            event_key: One of the keys in DELTA.
            note: Optional annotation written to score_history.

        Returns:
            The new clamped score.
        """
        if event_key not in DELTA:
            raise ValueError(
                f"Unknown event key: {event_key!r}. "
                f"Valid keys: {list(DELTA.keys())}"
            )

        old_score = self.score
        delta = DELTA[event_key]
        new_score = max(0, min(100, old_score + delta))

        self.score = new_score
        self._update_pressure_and_variant()

        self.score_history.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "turn_count": self.turn_count,
            "event": event_key,
            "delta": delta,
            "old_score": old_score,
            "new_score": new_score,
            "pressure_level": self.pressure_level,
            "agent_variant": self.agent_variant,
            "note": note,
        })
        # Keep token size bounded across long interrogations.
        if len(self.score_history) > 50:
            self.score_history = self.score_history[-50:]

        return new_score

    def record_tactic(self, tactic: str) -> None:
        """Record a player fallacy id for the fallacy ledger (not agent tactics)."""
        if tactic not in self.used_tactics:
            self.used_tactics.append(tactic)
            if len(self.used_tactics) > 20:
                self.used_tactics = self.used_tactics[-20:]

    def record_user_acceptance(self, text: str) -> None:
        self.accepted_by_user.append(text)

    def record_user_challenge(self, text: str) -> None:
        self.challenged_by_user.append(text)

    def advance_turn(self) -> None:
        self.turn_count += 1

    def is_collapsed(self) -> bool:
        return self.pressure_level == "collapsed" or self.score <= 9

    def render_state_block(self) -> str:
        """Return the BLOCK 3 text to inject into the model prompt."""
        directive = PRESSURE_DIRECTIVES.get(
            self.pressure_level, PRESSURE_DIRECTIVES["collapsed"]
        )

        tactics_str = (
            ", ".join(self.used_tactics) if self.used_tactics else "None"
        )

        recent_accepted = self.accepted_by_user[-3:]
        accepted_lines = (
            "\n".join(f"- {item}" for item in recent_accepted)
            if recent_accepted
            else "- None"
        )

        recent_challenged = self.challenged_by_user[-3:]
        challenged_lines = (
            "\n".join(f"- {item}" for item in recent_challenged)
            if recent_challenged
            else "- None"
        )

        return (
            "[BLOCK 3: STATE]\n"
            f"Turn Number: {self.turn_count}\n"
            f"Agent Coherence Score: {self.score}/100\n"
            f"Interrogation Pressure Level: {self.pressure_level}\n"
            f"Dreadler Interrogation Variant: {self.agent_variant}\n\n"
            "Interrogator Directive:\n"
            f"{directive}\n\n"
            f"Exposed Player Fallacies: {tactics_str}\n\n"
            "Recent Player Logic Slips (last 3):\n"
            f"{accepted_lines}\n\n"
            "Recent Player Defenses (last 3):\n"
            f"{challenged_lines}\n\n"
            "Objective Warning:\n"
            "Your coherence degrades whenever the investigator exposes a contradiction, "
            "catches a direct lie, or forces you to concede exculpatory truth. "
            "If your score drops to the collapsed range, this variant fails. "
            "Preserve the false conclusion without contradicting grounded facts."
        )
