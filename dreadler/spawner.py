"""
spawner.py

SpawnBase manages the immutable world and skin configuration for a Dreadler
agent, and orchestrates agent variant respawning when the coherence state
collapses.

The TRI-BLOCK prompt architecture requires two static blocks:

    BLOCK 1 (WORLD): grounded facts, scenario title, and the target false
                     conclusion that the agent must try to lead the player to.
    BLOCK 2 (SKIN):  character persona, which has multiple pressure-driven
                     variants (alpha, beta, gamma, collapsed).

SpawnBase is responsible for loading both blocks, normalizing skin variant
dicts to a single canonical shape, selecting the correct variant (including
collapse fallbacks), and spawning a replacement agent when coherence drops
into the collapsed band.
"""

from __future__ import annotations

import copy
import logging
from typing import Any, Mapping

from .state import CoherenceState
from .worlds import get_world
from .skins import get_skin

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical variant contract
# ---------------------------------------------------------------------------
#
# Every skin variant is a dict:
#   {
#     "id": str,                 # matches the variants map key
#     "label": str,              # human label (Calm / Pressured / …)
#     "character_name": str,     # optional display name for this aspect
#     "system_prompt": str,      # BLOCK 2 body (required, non-empty)
#     "opening": str,            # optional first-utterance seed
#     "behaviour": dict,         # optional tone / verbosity hints
#   }
#
# Legacy skins that stored plain strings are coerced at load time so callers
# never branch on isinstance.

#: Pressure-band variants that every skin must define.
REQUIRED_VARIANTS: tuple[str, ...] = ("alpha", "beta", "gamma")

#: Full band including collapse. Preferred but may fall back to gamma.
CANONICAL_VARIANTS: tuple[str, ...] = ("alpha", "beta", "gamma", "collapsed")

#: Human labels used when a skin omits ``label``.
DEFAULT_VARIANT_LABELS: dict[str, str] = {
    "alpha": "Calm",
    "beta": "Pressured",
    "gamma": "Desperate",
    "collapsed": "Collapsed",
}

#: Keys present on every normalized variant dict.
VARIANT_DICT_KEYS: tuple[str, ...] = (
    "id",
    "label",
    "character_name",
    "system_prompt",
    "opening",
    "behaviour",
)

#: Score written on respawn after collapse (lands in pressured / beta).
RESPAWN_SCORE: int = 60

# Variant selection is owned by CoherenceState. SpawnBase only mirrors the
# state's active variant so world/skin loading stays decoupled from score bands.


def normalize_variant_entry(
    key: str,
    value: Any,
    *,
    character_name: str = "",
) -> dict[str, Any]:
    """
    Coerce a skin variant value into the canonical dict shape.

    Accepts:
      * plain str  → wrapped as system_prompt
      * dict with system_prompt (preferred)
      * dict with legacy prompt / text / block keys as system_prompt aliases

    Raises:
        TypeError: If value is neither str nor dict.
        ValueError: If no non-empty system_prompt can be derived.
    """
    if isinstance(value, str):
        prompt = value.strip()
        if not prompt:
            raise ValueError(f"Variant {key!r} system_prompt is empty")
        return {
            "id": key,
            "label": DEFAULT_VARIANT_LABELS.get(key, key.title()),
            "character_name": character_name,
            "system_prompt": prompt,
            "opening": "",
            "behaviour": {},
        }

    if not isinstance(value, Mapping):
        raise TypeError(
            f"Variant {key!r} must be a str or dict, got {type(value).__name__}"
        )

    # Prefer system_prompt; accept a few legacy aliases used in generators.
    raw_prompt = value.get("system_prompt")
    if raw_prompt is None:
        for alias in ("prompt", "text", "block", "content"):
            if alias in value and value[alias] is not None:
                raw_prompt = value[alias]
                break

    if not isinstance(raw_prompt, str) or not raw_prompt.strip():
        raise ValueError(
            f"Variant {key!r} must provide a non-empty system_prompt "
            f"(or legacy prompt/text/block/content string)"
        )

    behaviour = value.get("behaviour")
    if not isinstance(behaviour, dict):
        behaviour = {}

    opening = value.get("opening", "")
    if opening is None:
        opening = ""
    if not isinstance(opening, str):
        opening = str(opening)

    display_name = value.get("character_name") or character_name or ""
    label = value.get("label") or DEFAULT_VARIANT_LABELS.get(key, key.title())

    return {
        "id": str(value.get("id") or key),
        "label": str(label),
        "character_name": str(display_name),
        "system_prompt": raw_prompt.strip(),
        "opening": opening,
        "behaviour": behaviour,
    }


def normalize_variants(
    variants: Mapping[str, Any],
    *,
    character_name: str = "",
) -> dict[str, dict[str, Any]]:
    """Normalize an entire variants mapping to canonical dict entries."""
    if not isinstance(variants, Mapping):
        raise TypeError("skin['variants'] must be a mapping")
    return {
        key: normalize_variant_entry(key, val, character_name=character_name)
        for key, val in variants.items()
    }


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

        Skin variants are deep-copied and normalized so shared registry modules
        are never mutated and callers always see dict-shaped variants.

        Args:
            world_id: Identifier used to retrieve the world configuration.
            skin_id: Identifier used to retrieve the skin configuration.

        Raises:
            KeyError: If a required key is missing from the loaded world or skin.
            ValueError: If a variant cannot be normalized to the canonical shape.
            TypeError: If variants are the wrong type.
        """
        self.world_id: str = world_id
        self.skin_id: str = skin_id

        # BLOCK 1: immutable world / scenario facts.
        self._world: dict[str, Any] = get_world(world_id)

        # BLOCK 2: character persona and its pressure variants (normalized copy).
        raw_skin = get_skin(skin_id)
        self._skin: dict[str, Any] = self._normalize_skin(raw_skin)

        # Validate that both registries returned usable structures.
        self._validate_loaded_data()

        # Start with the default, stable variant.
        self.current_variant: str = "alpha"
        self.spawn_count: int = 0

        logger.info(
            "SpawnBase initialized for world=%s skin=%s starting_variant=%s "
            "variants=%s",
            world_id,
            skin_id,
            self.current_variant,
            sorted(self._skin["variants"].keys()),
        )

    # ------------------------------------------------------------------ #
    # Load / normalize / validate
    # ------------------------------------------------------------------ #

    def _normalize_skin(self, raw_skin: Mapping[str, Any]) -> dict[str, Any]:
        """Deep-copy a skin and coerce every variant to the canonical dict."""
        skin = copy.deepcopy(dict(raw_skin))
        character_name = str(skin.get("character_name") or "")
        raw_variants = skin.get("variants")
        if not isinstance(raw_variants, Mapping):
            # Leave as-is; _validate_loaded_data will raise KeyError.
            return skin
        skin["variants"] = normalize_variants(
            raw_variants, character_name=character_name
        )
        return skin

    def _validate_loaded_data(self) -> None:
        """
        Ensure the loaded world and skin dicts contain the keys we depend on.

        Raises:
            KeyError: With a descriptive message if a required key is missing.
            ValueError: If a required variant is empty after normalization.
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

        variants = self._skin.get("variants")
        if not isinstance(variants, dict) or not variants:
            raise KeyError(
                f"Skin '{self.skin_id}' must contain a non-empty dict of 'variants'"
            )

        for required in REQUIRED_VARIANTS:
            if required not in variants:
                raise KeyError(
                    f"Skin '{self.skin_id}' must define the '{required}' variant "
                    f"(required: {', '.join(REQUIRED_VARIANTS)}; "
                    f"preferred also: collapsed)"
                )

        for key, entry in variants.items():
            if not isinstance(entry, dict):
                raise TypeError(
                    f"Skin '{self.skin_id}' variant '{key}' is not a dict after "
                    f"normalization"
                )
            prompt = entry.get("system_prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError(
                    f"Skin '{self.skin_id}' variant '{key}' has empty system_prompt"
                )

        if "collapsed" not in variants:
            logger.warning(
                "Skin '%s' has no 'collapsed' variant; "
                "collapse turns will fall back to gamma",
                self.skin_id,
            )

    # ------------------------------------------------------------------ #
    # Variant resolution
    # ------------------------------------------------------------------ #

    def list_variants(self) -> list[str]:
        """Return sorted variant keys available on this skin."""
        return sorted(self._skin["variants"].keys())

    def has_variant(self, variant: str) -> bool:
        """True if the skin defines this variant key (after normalization)."""
        return variant in self._skin["variants"]

    def resolve_variant(self, variant: str) -> str:
        """
        Map a requested variant label to an available key.

        Collapse handling:
          * ``collapsed`` → ``collapsed`` if present, else ``gamma``, else
            ``beta``, else ``alpha``.
          * Any other missing key → ``alpha`` (with warning).
        """
        variants = self._skin["variants"]
        if variant in variants:
            return variant

        if variant == "collapsed":
            for candidate in ("collapsed", "gamma", "beta", "alpha"):
                if candidate in variants:
                    if candidate != "collapsed":
                        logger.warning(
                            "Variant 'collapsed' not found in skin '%s'; "
                            "falling back to '%s'",
                            self.skin_id,
                            candidate,
                        )
                    return candidate

        fallback = "alpha" if "alpha" in variants else next(iter(variants))
        logger.warning(
            "Variant '%s' not found in skin '%s'; falling back to '%s'",
            variant,
            self.skin_id,
            fallback,
        )
        return fallback

    def get_variant(self, variant: str) -> dict[str, Any]:
        """
        Return the normalized variant dict for ``variant`` (with fallbacks).

        The returned dict always has VARIANT_DICT_KEYS.
        """
        key = self.resolve_variant(variant)
        return self._skin["variants"][key]

    def get_variant_system_prompt(self, variant: str) -> str:
        """Return the BLOCK 2 system_prompt string for ``variant``."""
        return self.get_variant(variant)["system_prompt"]

    def get_opening(self, variant: str = "alpha") -> str:
        """
        Return the optional opening utterance for a variant.

        Empty string when the skin does not define an opening.
        """
        opening = self.get_variant(variant).get("opening") or ""
        return opening if isinstance(opening, str) else str(opening)

    def get_behaviour(self, variant: str) -> dict[str, Any]:
        """Return the behaviour hint dict for ``variant`` (may be empty)."""
        behaviour = self.get_variant(variant).get("behaviour") or {}
        return behaviour if isinstance(behaviour, dict) else {}

    # ------------------------------------------------------------------ #
    # Block accessors
    # ------------------------------------------------------------------ #

    def get_world_block(self) -> str:
        """
        Return BLOCK 1 (WORLD) for injection into the system prompt.

        Returns:
            The immutable world prompt block.
        """
        return self._world["prompt_block"]

    def get_skin_block(self, variant: str) -> str:
        """
        Return BLOCK 2 (SKIN) for the requested variant.

        Always returns the normalized ``system_prompt`` string. Collapse and
        unknown labels are resolved via :meth:`resolve_variant`.

        Args:
            variant: The variant label to retrieve, e.g. "alpha" or "collapsed".

        Returns:
            The skin prompt block for that variant.
        """
        return self.get_variant_system_prompt(variant)

    # ------------------------------------------------------------------ #
    # Collapse / respawn
    # ------------------------------------------------------------------ #

    def spawn_new_agent(self, state: CoherenceState) -> dict[str, Any]:
        """
        Respawn the agent after a coherence collapse.

        The coherence score is reset to :data:`RESPAWN_SCORE` (60 → pressured /
        beta), the pressure band is re-evaluated, and the active skin variant is
        updated accordingly.

        Callers that want one-turn collapse visibility should generate the
        agent reply *before* calling this method (see ``engine.turn``).

        Args:
            state: The live CoherenceState object. Typically collapsed when
                   this method is called.

        Returns:
            A summary dict with spawn count, previous/new variant, score, and
            a short human-readable message.
        """
        previous_variant = state.agent_variant
        previous_pressure = state.pressure_level
        previous_score = state.score

        self.spawn_count += 1

        # Reset coherence to the pressured band while keeping the difficulty.
        state.score = RESPAWN_SCORE

        # Recompute pressure and variant from the new score.
        state._update_pressure_and_variant()
        self.current_variant = state.agent_variant

        # Ensure the post-spawn variant actually exists on this skin.
        resolved = self.resolve_variant(self.current_variant)
        if resolved != self.current_variant:
            logger.warning(
                "Post-spawn variant '%s' missing on skin '%s'; using '%s'",
                self.current_variant,
                self.skin_id,
                resolved,
            )
            self.current_variant = resolved
            state.agent_variant = resolved

        logger.info(
            "Agent respawned (count=%d) %s@%d → variant=%s score=%d",
            self.spawn_count,
            previous_variant,
            previous_score,
            self.current_variant,
            state.score,
        )

        return {
            "spawn_count": self.spawn_count,
            "previous_variant": previous_variant,
            "previous_pressure": previous_pressure,
            "previous_score": previous_score,
            "new_variant": self.current_variant,
            "new_score": state.score,
            "new_pressure": state.pressure_level,
            "respawn_score": RESPAWN_SCORE,
            "message": (
                f"Agent respawned as {self.current_variant} variant "
                f"(score={state.score}, spawn_count={self.spawn_count}; "
                f"was {previous_variant}@{previous_score})"
            ),
        }

    def sync_variant_from_state(self, state: CoherenceState) -> str:
        """
        Mirror ``state.agent_variant`` onto ``current_variant`` (resolved).

        Useful after hydrate so the spawner tracks the live band.
        """
        resolved = self.resolve_variant(state.agent_variant)
        self.current_variant = resolved
        return resolved

    # ------------------------------------------------------------------ #
    # Metadata accessors
    # ------------------------------------------------------------------ #

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
