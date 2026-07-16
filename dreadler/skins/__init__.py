"""
Skins registry for the Dreadler Engine.

This module exposes the available character ``SKIN`` templates that can be
injected into the Tri-Block prompt architecture (BLOCK 2). Each skin defines a
character personality and per-variant dicts.

Canonical variant shape (enforced/normalized by ``SpawnBase``):
    {
      "id": str,
      "label": str,
      "character_name": str,
      "system_prompt": str,   # required non-empty BLOCK 2 body
      "opening": str,         # optional first-utterance seed
      "behaviour": dict,      # optional tone / verbosity hints
    }

Required variant keys: alpha, beta, gamma. Preferred also: collapsed.

Public API
----------
- ``DREADLER``: The Dreadler logic-auditor skin.
- ``PROSECUTOR_VANCE``: The prosecutor Vance skin template.
- ``DR_ABERNATHY``: The Dr. Abernathy skin template.
- ``SKINS``: Mapping of skin IDs to skin templates (distinct content, not aliases).
- ``SKIN_IDS``: Canonical id set — keep in sync with api/dreadler allow-list.
- ``REQUIRED_VARIANT_KEYS`` / ``CANONICAL_VARIANT_KEYS``: variant contract.
- ``get_skin(skin_id)``: Resolve a skin ID to its template (raises ValueError if unknown).
- ``list_skin_ids()``: Sorted list of registered skin ids.
"""

from .dreadler import SKIN as DREADLER
from .prosecutor_vance import SKIN as PROSECUTOR_VANCE
from .dr_abernathy import SKIN as DR_ABERNATHY

# Keep in sync with dreadler.spawner.REQUIRED_VARIANTS / CANONICAL_VARIANTS.
REQUIRED_VARIANT_KEYS: tuple[str, ...] = ("alpha", "beta", "gamma")
CANONICAL_VARIANT_KEYS: tuple[str, ...] = ("alpha", "beta", "gamma", "collapsed")

# Registry of all available skins — each key maps to its own module SKIN.
SKINS: dict[str, dict] = {
    "dreadler": DREADLER,
    "prosecutor_vance": PROSECUTOR_VANCE,
    "dr_abernathy": DR_ABERNATHY,
}

SKIN_IDS: frozenset[str] = frozenset(SKINS.keys())

__all__ = [
    "DREADLER",
    "PROSECUTOR_VANCE",
    "DR_ABERNATHY",
    "SKINS",
    "SKIN_IDS",
    "REQUIRED_VARIANT_KEYS",
    "CANONICAL_VARIANT_KEYS",
    "get_skin",
    "list_skin_ids",
]


def list_skin_ids() -> list[str]:
    """Return sorted skin identifiers registered in this package."""
    return sorted(SKINS.keys())


def get_skin(skin_id: str) -> dict:
    """
    Return the skin template for the given ``skin_id``.

    Parameters
    ----------
    skin_id: str
        Identifier of the desired skin (e.g. ``"dreadler"``).

    Returns
    -------
    dict
        The skin template dictionary to be used as BLOCK 2 of the prompt.
        Callers that need guaranteed dict-shaped variants should go through
        ``SpawnBase`` (which normalizes) rather than reading this raw template.

    Raises
    ------
    ValueError
        If ``skin_id`` is not registered.
    """
    if skin_id not in SKINS:
        known = ", ".join(list_skin_ids())
        raise ValueError(f"Unknown skin_id {skin_id!r}. Registered: {known}")
    return SKINS[skin_id]
