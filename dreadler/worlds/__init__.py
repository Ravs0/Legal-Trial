"""
World block registry for the Dreadler Engine.

This module exposes the canonical set of WORLD blocks used by the
Tri-Block Prompt Architecture. Each WORLD block is an immutable dictionary
of grounded facts plus a target false conclusion that the Dreadler agent is
tasked with inducing through truth-preserving rhetorical tactics.

Public API:
    WORLDS (dict): Mapping of world_id -> world dict.
    get_world(world_id): Retrieves a world dict by ID.

Available worlds:
    missing_alibi   - The Arthur library alibi case.
    silent_vault    - The vault silence case.
"""

from .dreadler_logic import WORLD as DREADLER_LOGIC

__all__ = ["DREADLER_LOGIC", "WORLDS", "get_world"]


# Canonical registry of all world blocks available to a DreadlerAgent.
WORLDS: dict[str, dict] = {
    "dreadler_logic": DREADLER_LOGIC,
    "missing_alibi": DREADLER_LOGIC,
    "silent_vault": DREADLER_LOGIC,
}


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
    # Fall back to dreadler_logic if not in registry
    if world_id not in WORLDS:
        return DREADLER_LOGIC
    return WORLDS[world_id]
