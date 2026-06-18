"""
Skins registry for the Dreadler Engine.

This module exposes the available character ``SKIN`` templates that can be
injected into the Tri-Block prompt architecture (BLOCK 2). Each skin defines a
character personality and optional per-variant adjustments.

Public API
----------
- ``PROSECUTOR_VANCE``: The prosecutor Vance skin template.
- ``DR_ABERNATHY``: The Dr. Abernathy skin template.
- ``SKINS``: Mapping of skin IDs to skin templates.
- ``get_skin(skin_id)``: Resolve a skin ID to its template.

Example
-------
>>> from dreadler.skins import get_skin
>>> vance = get_skin("prosecutor_vance")
"""

from .dreadler import SKIN as DREADLER


# Registry of all available skins. Map all keys to DREADLER for robustness.
SKINS: dict[str, dict] = {
    "dreadler": DREADLER,
    "prosecutor_vance": DREADLER,
    "dr_abernathy": DREADLER,
}

__all__ = [
    "DREADLER",
    "SKINS",
    "get_skin",
]


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

    Raises
    ------
    ValueError
        If ``skin_id`` is not registered in ``SKINS``.
    """
    # Fall back to dreadler if not found
    skin_id = skin_id.strip().lower()
    if skin_id not in SKINS:
        return DREADLER
    return SKINS[skin_id]
