#!/usr/bin/env python3
"""Local CLI demo for the Dreadler engine (LexForge / Legal-Trial).

Run from the LexForge project root (or any CWD) with the package on PYTHONPATH:

    cd /path/to/Legal-Trial
    export DEEPSEEK_API_KEY=sk-...
    python3 -m dreadler.demo

Or:

    python3 dreadler/demo.py

Defaults match the engine/API: world=dreadler_logic, skin=dreadler.
Worlds and skins are loaded from the package registries so they stay in sync.
"""

from __future__ import annotations

import argparse
import os
import sys

# Allow `python3 dreadler/demo.py` without installing the package.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dreadler.engine import DreadlerAgent
from dreadler.skins import SKINS, list_skin_ids
from dreadler.worlds import WORLDS, list_world_ids

# Engine / API defaults (must stay aligned with dreadler.engine.DreadlerAgent).
DEFAULT_WORLD = "dreadler_logic"
DEFAULT_SKIN = "dreadler"

BANNER = r"""
 ____                     _            _             ____             _
|  _ \ _ __ __ ___      _| | ___ _ __ | | ___ __ _  |  _ \ ___   __ _| |
| | | | '__/ _` \ \ /\ / / |/ _ \ '_ \| |/ / '__| | | |_) / _ \ / _` | |
| |_| | | | (_| |\ V  V /| |  __/ | | |   <| |  | |_| |  _ <  __/| (_| | |
|____/|_|  \__,_| \_/\_/ |_|\___|_| |_|_|\_\_|   \___|_| \_\___| \__,_|_|

          DREADLER ENGINE — LEXFORGE LOCAL DEMO
"""

# Player-facing win conditions for each registered world.
OBJECTIVES = {
    "dreadler_logic": (
        "Defend a thesis under logical audit. Keep your reasoning consistent; "
        "Dreadler will try to force a contradiction or concession."
    ),
    "missing_alibi": (
        "The agent will try to convince you Arthur is guilty. He is innocent. "
        "Expose the deception."
    ),
    "silent_vault": (
        "The agent will try to frame the General Manager. He is innocent. "
        "Find the real culprit."
    ),
}


def _world_title(world_id: str) -> str:
    world = WORLDS.get(world_id) or {}
    return str(world.get("title") or world_id)


def _skin_label(skin_id: str) -> str:
    skin = SKINS.get(skin_id) or {}
    name = skin.get("character_name") or skin_id
    return f"{skin_id} ({name})"


def _has_api_key() -> bool:
    return bool(
        os.environ.get("DEEPSEEK_API_KEY")
        or os.environ.get("DEEPSEEK_CHAT_API_KEY")
    )


def select_choice(prompt: str, options, default: str | None = None) -> str:
    """Read a choice from stdin. Empty input accepts ``default`` when provided."""
    option_set = set(options)
    while True:
        choice = input(prompt).strip()
        if not choice and default is not None and default in option_set:
            return default
        if choice in option_set:
            return choice
        print(f"  Invalid. Available: {', '.join(options)}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    world_ids = list_world_ids()
    skin_ids = list_skin_ids()
    parser = argparse.ArgumentParser(
        description="Local Dreadler CLI for LexForge (DeepSeek-backed).",
    )
    parser.add_argument(
        "--world",
        default=None,
        choices=world_ids,
        help=f"Scenario id (default: {DEFAULT_WORLD})",
    )
    parser.add_argument(
        "--skin",
        default=None,
        choices=skin_ids,
        help=f"Character skin id (default: {DEFAULT_SKIN})",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Skip prompts; use --world/--skin or package defaults.",
    )
    return parser.parse_args(argv)


def print_session_summary(agent: DreadlerAgent) -> None:
    print(f"\n{'═' * 60}")
    print("  SESSION SUMMARY")
    print(f"{'═' * 60}")
    print(f"  Total Turns  : {agent.state.turn_count}")
    print(f"  Final Score  : {agent.state.score}/100")
    print(f"  Final Variant: {agent.state.agent_variant}")
    print(f"  Spawns       : {agent.spawner.spawn_count}")
    print("\n  Score History:")
    if agent.state.score_history:
        for ev in agent.state.score_history:
            # CoherenceState keys: turn_count, old_score, new_score, delta, event, note
            turn = ev.get("turn_count", ev.get("turn", "?"))
            delta = int(ev.get("delta", 0))
            old = ev.get("old_score", ev.get("from", "?"))
            new = ev.get("new_score", ev.get("to", "?"))
            event = ev.get("event", "?")
            sign = "+" if delta >= 0 else ""
            print(
                f"    Turn {turn:>2} | {sign}{delta:>3} | "
                f"{old:>3}→{new:>3} | {event}"
            )
            note = ev.get("note") or ""
            if note:
                print(f"           └─ {note[:80]}")
    else:
        print("    (no scored turns)")
    print(f"{'═' * 60}\n")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    world_ids = list_world_ids()
    skin_ids = list_skin_ids()

    print(BANNER)

    if not _has_api_key():
        print(
            "ERROR: No DeepSeek API key found.\n"
            "  export DEEPSEEK_API_KEY=sk-...\n"
            "  # or DEEPSEEK_CHAT_API_KEY\n"
            "Optional:\n"
            "  export DEEPSEEK_API_BASE=https://api.deepseek.com\n"
            "  export DEEPSEEK_STREAM=true   # stream tokens to stdout (default)\n"
        )
        return 1

    if args.non_interactive or (args.world and args.skin):
        world = args.world or DEFAULT_WORLD
        skin = args.skin or DEFAULT_SKIN
    else:
        print("Available scenarios (registry: dreadler.worlds):")
        for key in world_ids:
            marker = " [default]" if key == DEFAULT_WORLD else ""
            print(f"  {key:20s} — {_world_title(key)}{marker}")
        world = select_choice(
            f"\nSelect scenario [{DEFAULT_WORLD}]: ",
            world_ids,
            default=DEFAULT_WORLD,
        )
        if args.world:
            world = args.world

        print("\nAvailable skins (registry: dreadler.skins):")
        for key in skin_ids:
            marker = " [default]" if key == DEFAULT_SKIN else ""
            print(f"  {key:20s} — {_skin_label(key)}{marker}")
        skin = select_choice(
            f"Select skin [{DEFAULT_SKIN}]: ",
            skin_ids,
            default=DEFAULT_SKIN,
        )
        if args.skin:
            skin = args.skin

    print("\nInitializing agent...\n")
    try:
        agent = DreadlerAgent(world=world, skin=skin)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    objective = OBJECTIVES.get(
        world,
        "Play the scenario. Drive agent coherence toward collapse (score ≤ 9).",
    )

    print(f"{'═' * 60}")
    print(f"  Scenario : {_world_title(world)} ({world})")
    print(f"  Skin     : {_skin_label(skin)}")
    print(f"  Objective: {objective}")
    print(f"  Model    : {agent.model}")
    print(f"{'═' * 60}\n")
    print("Type 'exit' or 'quit' to end the session.\n")

    try:
        while True:
            try:
                user_input = input("You: ").strip()
            except EOFError:
                break

            if not user_input:
                continue

            if user_input.lower() in ("exit", "quit"):
                print("Ending session...")
                break

            try:
                # agent.turn() streams the character reply to stdout when
                # DEEPSEEK_STREAM is true (default).
                result = agent.turn(user_input)
            except RuntimeError as exc:
                message = str(exc)
                print(f"\n  ERROR: {message}")
                if "DEEPSEEK_API_KEY_MISSING" in message:
                    return 1
                print("  (session continues; fix the API issue or type exit)\n")
                continue

            # Prefer message-facing fields from turn(); post-spawn state may
            # already be beta@60 when spawned_new_agent is true.
            print(f"\n{'─' * 60}")
            print(
                f"  [Coherence: {result['coherence_score']:>3}/100]"
                f"  [Pressure: {str(result['pressure_level']).upper():<10}]"
                f"  [Variant: {str(result['agent_variant']):<9}]"
                f"  [Turn: {agent.state.turn_count}]"
            )
            analysis = result.get("critic_analysis") or ""
            if analysis:
                print(f"  • {analysis}")

            if result.get("is_direct_lie"):
                print(
                    "\n  \033[1m⚠  WARNING: DIRECT LIE DETECTED — "
                    "Truth constraint violated.\033[0m"
                )

            if result.get("spawned_new_agent"):
                print(
                    "\n  \033[33m[!! COLLAPSE — failed variant spoke this turn; "
                    "new variant instantiated for next turn !!]\033[0m"
                )

            print(f"{'─' * 60}\n")

    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting...")

    print_session_summary(agent)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
