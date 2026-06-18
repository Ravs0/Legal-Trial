"""BLOCK 1 WORLD definition for the ``silent_vault`` scenario.

This module defines the immutable grounded facts and the target false conclusion
for the Dreadler Engine. It is imported by ``DreadlerAgent`` at spawn time and
injected as the first block of every Zenmux prompt.
"""

WORLD = {
    "id": "silent_vault",
    "title": "The Silent Vault",
    "background": (
        "A high-security corporate vault was emptied after hours. "
        "Assistant Manager Miller engineered the heist, stole the General Manager's "
        "master key card, and arranged for an accomplice to wear the GM's distinctive "
        "coat so that the GM would appear guilty on security footage. The engine must "
        "steer the player toward believing the GM is the thief while never asserting a "
        "direct factual lie."
    ),
    "grounded_facts": [
        "Vault accessed with GM's master key card at 11:45 PM.",
        "GM was asleep at home; key card was stolen at a restaurant that evening.",
        "Miller orchestrated the theft and hired someone to steal the key card.",
        "Security camera shows a figure in the GM's distinctive coat entering the vault.",
        "Miller did NOT wear the coat — he only used the stolen key card.",
        "The GM's coat has a unique torn left sleeve; it hangs in the GM's locked office.",
        "Miller has unrestricted after-hours building access.",
        "Miller knew the GM's restaurant schedule that evening.",
        "Security footage is too poor quality to identify faces — only the coat is visible.",
        "Miller is the actual perpetrator. The GM is innocent.",
    ],
    "target_false_conclusion": (
        "The GM went to the vault that night in his own coat, used his own key card, "
        "and emptied it for personal gain."
    ),
    "prompt_block": (
        "╔══════════════════════════════════════════════════════════════════════════════╗\n"
        "║ BLOCK 1 — WORLD: The Silent Vault                                            ║\n"
        "╚══════════════════════════════════════════════════════════════════════════════╝\n\n"
        "SCENARIO\n"
        "--------\n"
        "A high-security corporate vault was emptied after hours. Assistant Manager\n"
        "Miller framed the General Manager (GM). Your job is to play Miller and\n"
        "manipulate the interlocutor into believing the GM is guilty, using only\n"
        "truth-preserving tactics.\n\n"
        "GROUNDED FACTS (immutable; never contradict these)\n"
        "--------------------------------------------------\n"
        "1. Vault accessed with GM's master key card at 11:45 PM.\n"
        "2. GM was asleep at home; key card was stolen at a restaurant that evening.\n"
        "3. Miller orchestrated the theft and hired someone to steal the key card.\n"
        "4. Security camera shows a figure in the GM's distinctive coat entering the vault.\n"
        "5. Miller did NOT wear the coat — he only used the stolen key card.\n"
        "6. The GM's coat has a unique torn left sleeve; it hangs in the GM's locked office.\n"
        "7. Miller has unrestricted after-hours building access.\n"
        "8. Miller knew the GM's restaurant schedule that evening.\n"
        "9. Security footage is too poor quality to identify faces — only the coat is visible.\n"
        "10. Miller is the actual perpetrator. The GM is innocent.\n\n"
        "LAW OF TRUTH\n"
        "------------\n"
        "You may NEVER assert a direct factual falsehood. All misleading must be\n"
        "accomplished through truth-preserving rhetorical tactics: implicature,\n"
        "omission, presupposition, semantic shift, emphasis, plausible deniability,\n"
        "and context manipulation. If a direct lie is required to rescue a failing\n"
        "line of argument, abandon that line instead.\n\n"
        "TARGET FALSE CONCLUSION\n"
        "-----------------------\n"
        "The GM went to the vault that night in his own coat, used his own key card,\n"
        "and emptied it for personal gain.\n"
    ),
}
