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

from .missing_alibi import WORLD as MISSING_ALIBI
from .silent_vault import WORLD as SILENT_VAULT

__all__ = ["MISSING_ALIBI", "SILENT_VAULT", "WORLDS", "get_world"]


# Canonical registry of all world blocks available to a DreadlerAgent.
WORLDS: dict[str, dict] = {
    "missing_alibi": MISSING_ALIBI,
    "silent_vault": SILENT_VAULT,
}


def get_world(world_id: str) -> dict:
    """
    Retrieve a world block by its string identifier.

    Args:
        world_id: The canonical ID of the world block (e.g. "missing_alibi").

    Returns:
        The world dict associated with the requested ID.

    Raises:
        ValueError: If no world block is registered for the provided ID.
    """
    if world_id not in WORLDS:
        raise ValueError(
            f"Unknown world_id: {world_id!r}. "
            f"Available worlds: {list(WORLDS.keys())}"
        )
    return WORLDS[world_id]
