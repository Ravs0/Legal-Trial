"""
spawner.py

SpawnBase manages the immutable world and skin configuration for a Dreadler
agent, and orchestrates agent variant respawning when the coherence state
collapses.

The TRI-BLOCK prompt architecture requires two static blocks:

    BLOCK 1 (WORLD): grounded facts, scenario title, and the target false
                     conclusion that the agent must try to lead the player to.
    BLOCK 2 (SKIN):  character persona, which has multiple pressure-driven
                     variants (alpha, beta, gamma).

SpawnBase is responsible for loading both blocks, selecting the correct
variant, and spawning a replacement agent when coherence drops into the
collapsed band.
"""

import logging
from typing import Any

from .state import CoherenceState
from .worlds import get_world
from .skins import get_skin

logger = logging.getLogger(__name__)

# Pressure score bands and their corresponding agent variants.
# Order is descending by score threshold so that the first matching band wins.
_PRESSURE_VARIANTS = (
    (70, "alpha"),    # calm
    (40, "beta"),     # pressured
    (10, "gamma"),    # desperate
    (0,  "collapsed") # collapsed (should trigger a respawn before use)
)


def _variant_for_score(score: int) -> str:
    """
    Map a coherence score to the corresponding agent variant label.

    Args:
        score: Current coherence score, 0-100.

    Returns:
        Variant label such as "alpha", "beta", "gamma", or "collapsed".
    """
    for threshold, variant in _PRESSURE_VARIANTS:
        if score >= threshold:
            return variant
    return "collapsed"


class SpawnBase:
    """
    Loads and exposes the WORLD and SKIN blocks for a Dreadler agent.

    Attributes:
        world_id: The identifier passed to the world registry.
        skin_id: The identifier passed to the skin registry.
        current_variant: The active skin variant label (e.g. "alpha").
        spawn_count: Number of times the agent has been respawned.
    """

    def __init__(self, world_id: str, skin_id: str) -> None:
        """
        Load the immutable world and skin dictionaries.

        Args:
            world_id: Identifier used to retrieve the world configuration.
            skin_id: Identifier used to retrieve the skin configuration.

        Raises:
            KeyError: If a required key is missing from the loaded world or skin.
        """
        self.world_id: str = world_id
        self.skin_id: str = skin_id

        # BLOCK 1: immutable world / scenario facts.
        self._world: dict[str, Any] = get_world(world_id)

        # BLOCK 2: character persona and its pressure variants.
        self._skin: dict[str, Any] = get_skin(skin_id)

        # Validate that both registries returned usable structures.
        self._validate_loaded_data()

        # Start with the default, stable variant.
        self.current_variant: str = "alpha"
        self.spawn_count: int = 0

        logger.info(
            "SpawnBase initialized for world=%s skin=%s starting_variant=%s",
            world_id,
            skin_id,
            self.current_variant,
        )

    def _validate_loaded_data(self) -> None:
        """
        Ensure the loaded world and skin dicts contain the keys we depend on.

        Raises:
            KeyError: With a descriptive message if a required key is missing.
        """
        required_world_keys = ("prompt_block", "title", "grounded_facts")
        for key in required_world_keys:
            if key not in self._world:
                raise KeyError(
                    f"World '{self.world_id}' is missing required key '{key}'"
                )

        if "character_name" not in self._skin:
            raise KeyError(
                f"Skin '{self.skin_id}' is missing required key 'character_name'"
            )

        if "variants" not in self._skin or not isinstance(self._skin["variants"], dict):
            raise KeyError(
                f"Skin '{self.skin_id}' must contain a dict of 'variants'"
            )

        if "alpha" not in self._skin["variants"]:
            raise KeyError(
                f"Skin '{self.skin_id}' must define at least the 'alpha' variant"
            )

    def get_world_block(self) -> str:
        """
        Return BLOCK 1 (WORLD) for injection into the Zenmux prompt.

        Returns:
            The immutable world prompt block.
        """
        return self._world["prompt_block"]

    def get_skin_block(self, variant: str) -> str:
        """
        Return BLOCK 2 (SKIN) for the requested variant.

        Falls back to the "alpha" variant if the requested variant is not
        defined in the loaded skin.

        Args:
            variant: The variant label to retrieve, e.g. "alpha".

        Returns:
            The skin prompt block for that variant.
        """
        variants = self._skin["variants"]

        if variant not in variants:
            logger.warning(
                "Variant '%s' not found in skin '%s'; falling back to 'alpha'",
                variant,
                self.skin_id,
            )
            variant = "alpha"

        val = variants[variant]
        if isinstance(val, dict):
            return val.get("system_prompt", "")
        return val

    def spawn_new_agent(self, state: CoherenceState) -> dict[str, Any]:
        """
        Respawn the agent after a coherence collapse.

        The coherence score is reset to 60 (preserving the current difficulty),
        the pressure band is re-evaluated, and the active skin variant is
        updated accordingly.

        Args:
            state: The live CoherenceState object. Must be collapsed when this
                   method is called.

        Returns:
            A summary dict with the new spawn count, variant, score, and a
            short human-readable message.
        """
        self.spawn_count += 1

        # Reset coherence to the pressured band while keeping the difficulty.
        state.score = 60

        # Recompute pressure and variant from the new score.
        state._update_pressure()
        self.current_variant = _variant_for_score(state.score)

        logger.info(
            "Agent respawned (count=%d) as variant=%s with score=%d",
            self.spawn_count,
            self.current_variant,
            state.score,
        )

        return {
            "spawn_count": self.spawn_count,
            "new_variant": self.current_variant,
            "new_score": state.score,
            "message": (
                f"Agent respawned as {self.current_variant} variant "
                f"(score={state.score}, spawn_count={self.spawn_count})"
            ),
        }

    def get_character_name(self) -> str:
        """
        Return the character name defined by the loaded skin.

        Returns:
            Character name string.
        """
        return self._skin["character_name"]

    def get_scenario_title(self) -> str:
        """
        Return the scenario title defined by the loaded world.

        Returns:
            Scenario title string.
        """
        return self._world["title"]

    def get_grounded_facts(self) -> list[str]:
        """
        Return the immutable list of grounded facts for this scenario.

        Returns:
            A list of fact strings.
        """
        return list(self._world["grounded_facts"])
