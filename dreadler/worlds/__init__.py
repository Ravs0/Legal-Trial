"""
World block registry for the Dreadler Engine.

This module exposes the canonical set of WORLD blocks used by the
Tri-Block Prompt Architecture. Each WORLD block is an immutable dictionary
of grounded facts plus a target false conclusion that the Dreadler agent is
tasked with inducing through truth-preserving rhetorical tactics.

Public API:
    WORLDS (dict): Mapping of world_id -> world dict (distinct content, not aliases).
    WORLD_IDS (frozenset): Canonical id set — keep in sync with api/dreadler allow-list.
    get_world(world_id): Retrieves a world dict by ID (raises ValueError if unknown).
    list_world_ids(): Sorted list of registered world ids.

Available worlds (distinct scenarios — not aliases):
    dreadler_logic  - Tribunal of Coherence (pure logic duel / Record laws).
    missing_alibi   - Vexham canal murder; Arthur Malone library alibi (innocent).
    silent_vault    - Meridian Holdings vault heist; Miller frames GM Chen.
"""

from .dreadler_logic import WORLD as DREADLER_LOGIC
from .missing_alibi import WORLD as MISSING_ALIBI
from .silent_vault import WORLD as SILENT_VAULT

__all__ = [
    "DREADLER_LOGIC",
    "MISSING_ALIBI",
    "SILENT_VAULT",
    "WORLDS",
    "WORLD_IDS",
    "get_world",
    "list_world_ids",
]


# Canonical registry — each key maps to its own module WORLD, not a shared alias.
WORLDS: dict[str, dict] = {
    "dreadler_logic": DREADLER_LOGIC,
    "missing_alibi": MISSING_ALIBI,
    "silent_vault": SILENT_VAULT,
}

WORLD_IDS: frozenset[str] = frozenset(WORLDS.keys())


def list_world_ids() -> list[str]:
    """Return sorted world identifiers registered in this package."""
    return sorted(WORLDS.keys())


def get_world(world_id: str) -> dict:
    """
    Retrieve a world block by its string identifier.

    Args:
        world_id: The canonical ID of the world block (e.g. "dreadler_logic").

    Returns:
        The world dict associated with the requested ID.

    Raises:
        ValueError: If no world block is registered for the provided ID.
    """
    if world_id not in WORLDS:
        known = ", ".join(list_world_ids())
        raise ValueError(f"Unknown world_id {world_id!r}. Registered: {known}")
    return WORLDS[world_id]
