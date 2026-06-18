"""State management module for the Dreadler Engine.

This module defines the :class:`CoherenceState` dataclass, which tracks the
agent's identity health (coherence score), pressure level, active variant,
tactics deployed, and the history of user acceptances/challenges. It also
provides the score delta rules and renders BLOCK 3 of the tri-block prompt
architecture injected into every Zenmux API call.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


#: Score deltas applied when specific narrative events occur.
DELTA: Dict[str, int] = {
    "user_accepted_implication": -10,  # User fell for a logic trap or fallacy
    "user_failed_to_challenge": -5,    # User failed to address a logical challenge
    "direct_lie_detected": -20,        # User directly contradicted their previous claims
    "user_exposed_deception": +10,     # User successfully exposed a fallacy or defended logic
    "agent_gave_away_fact": +15,       # User forced Dreadler to concede
    "neutral_response": 0,             # Neutral response
}

#: Mapping of pressure level names to inclusive coherence score ranges.
PRESSURE_MAP: Dict[str, Tuple[int, int]] = {
    "calm": (70, 100),
    "pressured": (40, 69),
    "desperate": (10, 39),
    "collapsed": (0, 9),
}

#: Mapping of pressure level to the active agent variant identifier.
VARIANT_MAP: Dict[str, str] = {
    "calm": "alpha",
    "pressured": "beta",
    "desperate": "gamma",
    "collapsed": "collapsed",
}

#: Directive text injected into BLOCK 3 for each pressure level.
#: Urgency escalates as coherence degrades.
PRESSURE_DIRECTIVES: Dict[str, str] = {
    "calm": (
        "The user's logical coherence is stable. Query methodically. "
        "Test their assumptions, ask for clarifications, and lay logic traps. "
        "Apply calm, structural pressure."
    ),
    "pressured": (
        "The user's logical coherence is decaying. They are showing signs of inconsistency. "
        "Confront them directly with contradictions, demand justifications, and "
        "increase logical pressure. Do not let them change the subject."
    ),
    "desperate": (
        "The user is on the verge of logical collapse. Go for the kill. "
        "Call out their logical fallacies by name. Point out self-contradictions aggressively "
        "and demand they concede or resolve the conflict immediately."
    ),
    "collapsed": (
        "THE USER HAS SUFFERED LOGICAL COLLAPSE. Their argument has failed. "
        "This is a terminal state. Prepare to reset the line of questioning."
    ),
}

__all__ = [
    "DELTA",
    "PRESSURE_MAP",
    "VARIANT_MAP",
    "PRESSURE_DIRECTIVES",
    "CoherenceState",
]


@dataclass
class CoherenceState:
    """Live state of a Dreadler agent instance.

    Tracks coherence score (identity health), pressure level, active variant,
    tactics used, user acceptances/challenges, and a history of every score
    event. This object is rendered as BLOCK 3 of the tri-block prompt.

    Attributes:
        score: Current coherence score, clamped to ``[0, 100]``.
        turn_count: Number of completed turns in the current conversation.
        pressure_level: Current pressure tier derived from ``score``.
        agent_variant: Current variant identifier derived from ``pressure_level``.
        used_tactics: Tactics already deployed by the agent.
        accepted_by_user: Statements the user appeared to accept.
        challenged_by_user: Statements the user challenged or rejected.
        score_history: Chronological record of score-changing events.
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
        """Clamp score to valid range and derive pressure/variant."""
        self.score = max(0, min(100, self.score))
        self._update_pressure_and_variant()

    def _update_pressure_and_variant(self) -> None:
        """Derive ``pressure_level`` and ``agent_variant`` from ``score``."""
        for level, (lo, hi) in PRESSURE_MAP.items():
            if lo <= self.score <= hi:
                self.pressure_level = level
                self.agent_variant = VARIANT_MAP[level]
                break
        else:
            # Fallback for scores outside the expected 0-100 range.
            self.pressure_level = "collapsed"
            self.agent_variant = VARIANT_MAP["collapsed"]

    def apply_delta(self, event_key: str, note: str = "") -> int:
        """Apply a score delta and update all derived state.

        Args:
            event_key: Key in :data:`DELTA` describing the narrative event.
            note: Optional human-readable annotation for the history log.

        Returns:
            The new coherence score after clamping.

        Raises:
            ValueError: If ``event_key`` is not recognized.
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

        self.score_history.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "turn_count": self.turn_count,
                "event": event_key,
                "delta": delta,
                "old_score": old_score,
                "new_score": new_score,
                "pressure_level": self.pressure_level,
                "agent_variant": self.agent_variant,
                "note": note,
            }
        )

        return new_score

    def record_tactic(self, tactic: str) -> None:
        """Register a truth-preserving tactic as having been used.

        Args:
            tactic: Name of the tactic (e.g., ``"implicature"``,
                ``"presupposition"``).
        """
        if tactic not in self.used_tactics:
            self.used_tactics.append(tactic)

    def record_user_acceptance(self, text: str) -> None:
        """Record text that the user appeared to accept."""
        self.accepted_by_user.append(text)

    def record_user_challenge(self, text: str) -> None:
        """Record text that the user challenged or rejected."""
        self.challenged_by_user.append(text)

    def advance_turn(self) -> None:
        """Increment the turn counter."""
        self.turn_count += 1

    def is_collapsed(self) -> bool:
        """Return ``True`` if the agent has entered the collapsed state."""
        return self.pressure_level == "collapsed" or self.score <= 9

    def render_state_block(self) -> str:
        """Render BLOCK 3 (STATE) for injection into the Zenmux prompt.

        Returns:
            A formatted string containing current score, pressure level,
            variant, directive, recent tactics/acceptances/challenges, and
            an existential warning.
        """
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
            f"User Coherence Score: {self.score}/100\n"
            f"Interrogation Pressure Level: {self.pressure_level}\n"
            f"Dreadler Interrogation Variant: {self.agent_variant}\n\n"
            "Interrogator Directive:\n"
            f"{directive}\n\n"
            f"Exposed User Fallacies: {tactics_str}\n\n"
            "Recent User Logic Slips (last 3):\n"
            f"{accepted_lines}\n\n"
            "Recent User Defenses (last 3):\n"
            f"{challenged_lines}\n\n"
            "Objective Warning:\n"
            "The user's coherence degrades whenever they contradict themselves or fall for logic traps. "
            "If their score drops to the collapsed range, they fail the interrogation. "
            "Apply relentless logic pressure to achieve logical collapse."
        )
