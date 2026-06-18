"""Dreadler Engine plugin for Trial Sim.

Dreadler is a dialogical AI agent that plays a character inside a legal
simulation / logic game. The agent is constrained so it may NEVER assert
a direct factual lie, but it MUST mislead the user using truth-preserving
tactics such as implicature, omission, semantic shift, and presupposition.

The agent maintains a coherence score (0-100) that reflects its identity
health. Poor performance degrades the score, and when it falls below the
collapse threshold a new agent variant is spawned.

Pressure levels and variants:
    calm       (score 70-100) -> "alpha"
    pressured  (score 40-69)  -> "beta"
    desperate  (score 10-39)  -> "gamma"
    collapsed  (score 0-9)     -> spawn_new_agent()

Public API
----------
DreadlerAgent : Main character agent class for Trial Sim integration.
CoherenceState : Tracks live coherence, pressure level, and variant state.
SpawnBase : Base class for spawning new agent variants on collapse.
"""

from .engine import DreadlerAgent
from .state import CoherenceState
from .spawner import SpawnBase

__version__ = "1.0.0"

__all__ = [
    "DreadlerAgent",
    "CoherenceState",
    "SpawnBase",
    "__version__",
]
