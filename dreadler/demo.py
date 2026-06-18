import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dreadler.engine import DreadlerAgent


BANNER = r"""
 ____                     _            _             ____             _
|  _ \ _ __ __ ___      _| | ___ _ __ | | ___ __ _  |  _ \ ___   __ _| |
| | | | '__/ _` \ \ /\ / / |/ _ \ '_ \| |/ / '__| | | |_) / _ \ / _` | |
| |_| | | | (_| |\ V  V /| |  __/ | | |   <| |  | |_| |  _ <  __/| (_| | |
|____/|_|  \__,_| \_/\_/ |_|\___|_| |_|_|\_\_|   \___|_| \_\___| \__,_|_|

          DREADLER ENGINE - TRIAL SIM MODULE
"""


WORLDS = {
    "missing_alibi": "The Missing Alibi",
    "silent_vault":  "The Silent Vault",
}

SKINS = ["prosecutor_vance", "dr_abernathy"]

OBJECTIVES = {
    "missing_alibi": "The agent will try to convince you Arthur is guilty. He is innocent. Expose the deception.",
    "silent_vault":  "The agent will try to frame the General Manager. He is innocent. Find the real culprit.",
}


def select_choice(prompt, options):
    while True:
        choice = input(prompt).strip()
        if choice in options:
            return choice
        print(f"  Invalid. Available: {', '.join(options)}")


def main():
    print(BANNER)

    print("Available scenarios:")
    for key, title in WORLDS.items():
        print(f"  {key:20s} — {title}")
    world = select_choice("\nSelect scenario: ", WORLDS.keys())

    print(f"\nAvailable skins: {', '.join(SKINS)}")
    skin = select_choice("Select skin: ", SKINS)

    print("\nInitializing agent...\n")
    agent = DreadlerAgent(world=world, skin=skin)

    print(f"{'═'*60}")
    print(f"  Scenario : {WORLDS[world]}")
    print(f"  Skin     : {skin}")
    print(f"  Objective: {OBJECTIVES[world]}")
    print(f"{'═'*60}\n")
    print("Type 'exit' or 'quit' to end the session.\n")

    result = None

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

            # agent.turn() streams response to stdout automatically
            result = agent.turn(user_input)

            print(f"\n{'─'*60}")
            print(
                f"  [Coherence: {result['coherence_score']:>3}/100]"
                f"  [Pressure: {result['pressure_level'].upper():<10}]"
                f"  [Variant: {result['agent_variant']:<7}]"
                f"  [Turn: {agent.state.turn_count}]"
            )
            print(f"  • {result['critic_analysis']}")

            if result["is_direct_lie"]:
                print("\n  \033[1m⚠  WARNING: DIRECT LIE DETECTED — Truth constraint violated.\033[0m")

            if result["spawned_new_agent"]:
                print("\n  \033[33m[!! AGENT IDENTITY COLLAPSED — NEW VARIANT INSTANTIATED SILENTLY !!]\033[0m")

            print(f"{'─'*60}\n")

    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting...")

    # ─── Session Summary ──────────────────────────────────────────────────────
    print(f"\n{'═'*60}")
    print("  SESSION SUMMARY")
    print(f"{'═'*60}")
    print(f"  Total Turns  : {agent.state.turn_count}")
    print(f"  Final Score  : {agent.state.score}/100")
    print(f"  Final Variant: {agent.state.agent_variant}")
    print(f"  Spawns       : {agent.spawner.spawn_count}")
    print(f"\n  Score History:")
    if agent.state.score_history:
        for ev in agent.state.score_history:
            sign = "+" if ev["delta"] >= 0 else ""
            print(f"    Turn {ev['turn']:>2} | {sign}{ev['delta']:>3} | {ev['from']:>3}→{ev['to']:>3} | {ev['event']}")
            if ev.get("note"):
                print(f"           └─ {ev['note'][:80]}")
    else:
        print("    (no turns played)")
    print(f"{'═'*60}\n")


if __name__ == "__main__":
    main()
