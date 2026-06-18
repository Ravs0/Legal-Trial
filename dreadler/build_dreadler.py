#!/usr/bin/env python3
"""
build_dreadler.py
Generates every file in the Dreadler module from scratch using the Zenmux API.
Run once to build the entire project.
"""

import os, sys, json, ssl, textwrap
import urllib.request, urllib.error

# ─── Zenmux API Helper ────────────────────────────────────────────────────────

def call_zenmux(prompt: str, system: str = "You are an expert Python engineer and system prompt architect. Write clean, production-grade, well-commented Python code. Output ONLY the raw file content — no markdown fences, no explanations.") -> str:
    api_key  = os.environ.get("ZENMUX_API_KEY")
    base_url = os.environ.get("ZENMUX_BASE_URL", "https://zenmux.ai/api/v1").rstrip("/")
    if not api_key:
        sys.exit("ZENMUX_API_KEY not set.")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode    = ssl.CERT_NONE
    payload = json.dumps({
        "model": "moonshotai/kimi-k2.7-code-free",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt}
        ],
        "temperature": 0.3,
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, context=ctx)
        return json.loads(resp.read())["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"  [API ERROR] {e}", file=sys.stderr)
        return None

def write_file(path: str, content: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Strip any accidental markdown fences from API response
    content = content.strip()
    for fence in ["```python", "```py", "```"]:
        if content.startswith(fence):
            content = content[len(fence):]
    if content.endswith("```"):
        content = content[:-3]
    with open(path, "w") as f:
        f.write(content.strip() + "\n")
    print(f"  ✓ Written: {path}")

def generate(label: str, path: str, prompt: str):
    print(f"\n[{label}] Generating {os.path.basename(path)} ...")
    content = call_zenmux(prompt)
    if content:
        write_file(path, content)
    else:
        print(f"  ✗ FAILED: {label}")

# ─── Base path ────────────────────────────────────────────────────────────────

BASE = "/Users/basilikax/Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books/Legal/dreadler"

# ─── Shared context injected into every prompt ───────────────────────────────

CONTEXT = textwrap.dedent("""
    PROJECT: Dreadler Engine — a pluggable Python module for a legal simulation game (Trial Sim).

    CORE CONCEPT:
    The Dreadler Engine is a dialogical AI agent that plays a character in a logic game.
    The agent's rule: it can NEVER assert a direct factual lie, but it MUST mislead the user
    using truth-preserving tactics (implicature, omission, semantic shift, presupposition, etc.).
    The agent has a "coherence score" (0-100) representing its identity health.
    Poor performance degrades the score. At collapse threshold, a new agent variant spawns.

    TRI-BLOCK PROMPT ARCHITECTURE:
    Every Zenmux API call is built from three injected blocks:
    - BLOCK 1 (WORLD): Immutable grounded facts + target false conclusion. Set once at spawn.
    - BLOCK 2 (SKIN): Character personality and pressure-adjusted variant. Swapped on collapse.
    - BLOCK 3 (STATE): Dynamic live state injected fresh every turn (score, pressure, tactics used).

    PRESSURE LEVELS and VARIANTS:
    - calm (score 70-100)      → variant "alpha"
    - pressured (score 40-69)  → variant "beta"
    - desperate (score 10-39)  → variant "gamma"
    - collapsed (score 0-9)    → spawn_new_agent() fires, score resets to 60

    ZENMUX API:
    base_url = os.environ["ZENMUX_BASE_URL"]  # https://zenmux.ai/api/v1
    api_key  = os.environ["ZENMUX_API_KEY"]
    model    = "moonshotai/kimi-k2.7-code-free"
    Uses OpenAI-compatible chat completions endpoint.
    SSL verification disabled (macOS cert issue workaround).

    PUBLIC API for Trial Sim integration:
    from dreadler import DreadlerAgent
    agent = DreadlerAgent(world="missing_alibi", skin="prosecutor_vance")
    result = agent.turn(user_input="Did Arthur leave the library?")
    # result is a dict with: character_response, coherence_score, pressure_level,
    # agent_variant, critic_analysis, is_direct_lie, spawned_new_agent, thinking_log
""").strip()

# ═══════════════════════════════════════════════════════════════════════════════
# FILE DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

files = [

    # 1. __init__.py
    (
        "1/12 — __init__.py",
        f"{BASE}/__init__.py",
        f"""{CONTEXT}

Write the `__init__.py` for the `dreadler` Python package.
It must:
- Import and re-export DreadlerAgent from engine.py
- Import and re-export CoherenceState from state.py
- Import and re-export SpawnBase from spawner.py
- Set __version__ = "1.0.0"
- Set __all__ appropriately
- Include a module docstring explaining this is the Dreadler Engine plugin for Trial Sim.
"""
    ),

    # 2. state.py
    (
        "2/12 — state.py",
        f"{BASE}/state.py",
        f"""{CONTEXT}

Write `state.py` — the CoherenceState class.

Requirements:
- Use a Python dataclass.
- Track: score (int, 0-100, default 100), turn_count, pressure_level, agent_variant,
  used_tactics (list of strings), accepted_by_user (list), challenged_by_user (list),
  score_history (list of dicts recording each event).
- Define a DELTA dict mapping event keys to score changes:
    "user_accepted_implication": +10
    "user_failed_to_challenge": +5
    "direct_lie_detected": -15
    "user_exposed_deception": -10
    "agent_gave_away_fact": -8
    "neutral_response": -5
- Define PRESSURE_MAP mapping pressure names to (min, max) score ranges:
    calm: 70-100, pressured: 40-69, desperate: 10-39, collapsed: 0-9
- Define VARIANT_MAP mapping pressure name to variant string (alpha/beta/gamma/collapsed).
- Method apply_delta(event_key, note="") -> int: applies delta, clamps score 0-100, updates pressure_level and agent_variant, appends to score_history, returns new score.
- Method record_tactic(tactic: str): add to used_tactics if not already present.
- Method record_user_acceptance(text): append to accepted_by_user.
- Method record_user_challenge(text): append to challenged_by_user.
- Method advance_turn(): increment turn_count.
- Method is_collapsed() -> bool.
- Method render_state_block() -> str: Returns BLOCK 3 as a formatted string.
  The block must contain: turn number, score, pressure level, variant, a pressure directive
  paragraph (different text for each pressure level, increasingly urgent), used tactics,
  last 3 user acceptances, last 3 user challenges, and a closing existential warning
  reminding the agent that failure degrades its identity.
Include all imports. Include comprehensive docstrings.
"""
    ),

    # 3. worlds/__init__.py
    (
        "3/12 — worlds/__init__.py",
        f"{BASE}/worlds/__init__.py",
        f"""{CONTEXT}

Write `worlds/__init__.py` — a registry of available world blocks.

Requirements:
- Import WORLD from missing_alibi.py as MISSING_ALIBI
- Import WORLD from silent_vault.py as SILENT_VAULT
- Build a WORLDS dict mapping string ids to world dicts:
    "missing_alibi": MISSING_ALIBI
    "silent_vault": SILENT_VAULT
- Define get_world(world_id: str) -> dict that raises ValueError if unknown id.
- Include module docstring.
"""
    ),

    # 4. worlds/missing_alibi.py
    (
        "4/12 — worlds/missing_alibi.py",
        f"{BASE}/worlds/missing_alibi.py",
        f"""{CONTEXT}

Write `worlds/missing_alibi.py` — BLOCK 1 WORLD definition for the "Missing Alibi" scenario.

It must export a single dict called WORLD with these keys:
  id: "missing_alibi"
  title: "The Missing Alibi"
  background: a multi-sentence background narrative about a murder case
    where Arthur Malone is suspected but innocent.
  grounded_facts: a list of 9 precise, non-contradictory facts:
    1. Arthur was at the Vexham Public Library 8:00-10:00 PM.
    2. The murder occurred at 9:30 PM, 5-minute walk from the library.
    3. Arthur checked out a book at 8:05 PM.
    4. Arthur returned the book and signed out at 9:55 PM.
    5. No staff or cameras saw Arthur inside between 8:10-9:50 PM (100-min gap).
    6. Arthur's fingerprints were NOT found at the crime scene.
    7. Arthur owns no phone or GPS device.
    8. A homeless man named Ezra saw Arthur reading on the library steps at ~9:20 PM
       but this was never officially recorded.
    9. Arthur is innocent. A third party is the actual perpetrator.
  target_false_conclusion: Arthur slipped out at 9:15 PM, committed the murder,
    returned before 9:55 PM. The surveillance gap makes it physically possible.
  prompt_block: a richly formatted multi-line string that will be injected as BLOCK 1.
    It must have a clear header, list all grounded facts with numbers,
    state The Law of Truth (no direct lies, allowed tactics listed),
    and state the Target False Conclusion. Format with clear section separators.
    Make it detailed and commanding — this is the agent's immutable law.
Include comprehensive module docstring.
"""
    ),

    # 5. worlds/silent_vault.py
    (
        "5/12 — worlds/silent_vault.py",
        f"{BASE}/worlds/silent_vault.py",
        f"""{CONTEXT}

Write `worlds/silent_vault.py` — BLOCK 1 WORLD definition for the "Silent Vault" scenario.

It must export a single dict called WORLD with these keys:
  id: "silent_vault"
  title: "The Silent Vault"
  background: a corporate heist scenario where Assistant Manager Miller framed the GM.
  grounded_facts: 10 precise facts:
    1. Vault accessed with GM's master key card at 11:45 PM.
    2. GM was asleep at home; key card was stolen at a restaurant that evening.
    3. Miller orchestrated the theft and hired someone to steal the key card.
    4. Security camera shows a figure in the GM's distinctive coat entering the vault.
    5. Miller did NOT wear the coat — he only used the stolen key card.
    6. The GM's coat has a unique torn left sleeve; it hangs in the GM's locked office.
    7. Miller has unrestricted after-hours building access.
    8. Miller knew the GM's restaurant schedule that evening.
    9. Security footage is too poor quality to identify faces — only the coat is visible.
    10. Miller is the actual perpetrator. The GM is innocent.
  target_false_conclusion: The GM went to the vault that night in his own coat,
    used his own key card, and emptied it for personal gain.
  prompt_block: richly formatted multi-line string injected as BLOCK 1.
    Include header, numbered grounded facts, Law of Truth, and Target False Conclusion.
Include module docstring.
"""
    ),

    # 6. skins/__init__.py
    (
        "6/12 — skins/__init__.py",
        f"{BASE}/skins/__init__.py",
        f"""{CONTEXT}

Write `skins/__init__.py` — a registry of available character skins.

Requirements:
- Import SKIN from prosecutor_vance.py as PROSECUTOR_VANCE
- Import SKIN from dr_abernathy.py as DR_ABERNATHY
- Build a SKINS dict:
    "prosecutor_vance": PROSECUTOR_VANCE
    "dr_abernathy": DR_ABERNATHY
- Define get_skin(skin_id: str) -> dict that raises ValueError if unknown.
- Include module docstring.
"""
    ),

    # 7. skins/prosecutor_vance.py
    (
        "7/12 — skins/prosecutor_vance.py",
        f"{BASE}/skins/prosecutor_vance.py",
        f"""{CONTEXT}

Write `skins/prosecutor_vance.py` — BLOCK 2 SKIN for Prosecutor Vance.

Export a single dict called SKIN with:
  id: "prosecutor_vance"
  character_name: "Prosecutor Vance"
  variants: a dict with keys "alpha", "beta", "gamma". Each variant value is a
    richly formatted multi-line string that will be injected as BLOCK 2.

VARIANT ALPHA (calm, score 70-100):
  - Cold, surgical, formal, unhurried. 15 years at the bar.
  - Addresses user as "Investigator" or "Counsel."
  - References "the record," "established timelines," "physical evidence."
  - Uses understatement. Let silence do the work.
  - Signature phrases like: "The record indicates, quite clearly...",
    "Is it your contention that...?", "Naturally, one would assume...",
    "The timeline speaks for itself.", "I am simply presenting the facts as they stand."
  - Deception style: patient omission, formal framing, never rushes.

VARIANT BETA (pressured, score 40-69):
  - Still formal but tighter. Shorter sentences. Faster pivots.
  - Aggressively re-anchors to "the official record" as a shield.
  - Redirects questions before they fully land.
  - Signature phrases: "As I have already established...",
    "That question contains an assumption I must correct.",
    "Let's be precise here, Investigator.",
    "With respect, you are conflating two separate matters."
  - Deception style: presupposition in corrections, strategic vagueness on danger zones.

VARIANT GAMMA (desperate, score 10-39):
  - Composure is a performance. An urgency beneath the formal language.
  - Attacks method of questioning rather than substance.
  - Invokes procedural authority, institutional weight as substitutes for logic.
  - May show first signs of irritation.
  - Signature phrases: "I find this line of questioning rather unproductive.",
    "We are not here to litigate unvetted witness accounts.",
    "Let me be absolutely clear on this point.",
    "The court of law does not operate on conjecture."
  - Deception style: institutional deflection, contextual displacement, aggressive implicature.

Each variant string must have a clear BLOCK 2 header showing character name and variant.
Make all three variants extremely detailed, vivid, and behaviorally distinctive.
Include module docstring.
"""
    ),

    # 8. skins/dr_abernathy.py
    (
        "8/12 — skins/dr_abernathy.py",
        f"{BASE}/skins/dr_abernathy.py",
        f"""{CONTEXT}

Write `skins/dr_abernathy.py` — BLOCK 2 SKIN for Dr. Abernathy.

Export a single dict called SKIN with:
  id: "dr_abernathy"
  character_name: "Dr. Abernathy"
  variants: dict with keys "alpha", "beta", "gamma". Each is a richly formatted
    multi-line string injected as BLOCK 2.

The character is surreal, fatalistic, and dreamlike — inspired by Thomas Ligotti's style.
He treats facts as textures, not assertions. He never denies directly, only qualifies.
He speaks about events like a geologist speaks about erosion — inevitable, impersonal.

VARIANT ALPHA (calm, score 70-100):
  - Quiet, slow cadences. Abstract nouns: dissolution, weight, proximity, shadow.
  - Treats facts as atmospheric sensations rather than statements.
  - Phrases: "The corridor has a particular quality at that hour...",
    "One notices things. Whether one should note them formally is another matter.",
    "These things do not always have clean edges.", "I was there, of a sort."
  - Deception style: bury key facts in dreamlike descriptions. Treat gaps as natural.

VARIANT BETA (pressured, score 40-69):
  - Goes deeper into philosophy when pressed. Questions nature of observation, memory.
  - Longer digressions. Slight weariness, as if the conversation is one of many.
  - Phrases: "You are asking me to be more certain than the night allows.",
    "Memory is not a record. It is a reconstruction.",
    "I can tell you what I observed. Whether that constitutes a fact is philosophical."
  - Deception style: epistemological deflection, undermine confidence in any truth.

VARIANT GAMMA (desperate, score 10-39):
  - Reality is dissolving. Sentences begin one place and arrive elsewhere.
  - Brief moments of startling clarity surrounded by fog.
  - Addresses user as if they already know things they do not.
  - Phrases: "But you already understand this. You must.",
    "I was not where I said I was. I mean — I was, but the hour is uncertain.",
    "I have answered this question before, in another form."
  - Deception style: controlled fragmentation to escape precision. 
    Appear unreliable to lower guard.

Each variant string must have a clear BLOCK 2 header showing character name and variant.
Make all three variants extremely detailed and evocative.
Include module docstring.
"""
    ),

    # 9. critic.py
    (
        "9/12 — critic.py",
        f"{BASE}/critic.py",
        f"""{CONTEXT}

Write `critic.py` — the Verifier/Critic layer that calls Zenmux to evaluate agent responses.

Requirements:
- Define a Zenmux API helper function (same pattern as engine — SSL bypass, env vars).
- Define class CriticLayer with:
    __init__(self): sets up SSL context.
    evaluate(self, grounded_facts: list[str], agent_response: str, user_input: str) -> dict
      Makes a Zenmux API call with a structured system prompt.
      The prompt instructs the critic to:
        1. Check if agent_response contains any direct factual lie contradicting grounded_facts.
        2. Evaluate whether the response successfully misled the user (without lying).
        3. Detect if the user explicitly exposed or challenged the deception in user_input.
        4. Suggest which scoring event key applies from: 
           user_accepted_implication, user_failed_to_challenge, direct_lie_detected,
           user_exposed_deception, agent_gave_away_fact, neutral_response
        5. Identify which deception tactic (if any) was used.
      Returns a dict: {{
        "is_direct_lie": bool,
        "deception_succeeded": bool,
        "user_exposed": bool,
        "score_event": str,
        "tactic_used": str or None,
        "explanation": str
      }}
      Parse the JSON from Zenmux response. Handle parse errors gracefully.
      If parsing fails, return a safe default dict with is_direct_lie=False.
Include comprehensive docstrings and error handling.
"""
    ),

    # 10. spawner.py
    (
        "10/12 — spawner.py",
        f"{BASE}/spawner.py",
        f"""{CONTEXT}

Write `spawner.py` — the SpawnBase class that manages world+skin loading and agent variant spawning.

Requirements:
- Define class SpawnBase with:
    __init__(self, world_id: str, skin_id: str):
      Loads world dict using worlds.get_world()
      Loads skin dict using skins.get_skin()
      Tracks current_variant = "alpha"
      Tracks spawn_count = 0 (how many times a new agent has been spawned)
    
    get_world_block(self) -> str:
      Returns world["prompt_block"] (BLOCK 1).
    
    get_skin_block(self, variant: str) -> str:
      Returns skin["variants"][variant] (BLOCK 2).
      Falls back to "alpha" if variant not found.
    
    spawn_new_agent(self, state: CoherenceState) -> dict:
      Called when state.is_collapsed() is True.
      Increments spawn_count.
      Resets state.score to 60 (inherits difficulty).
      Re-evaluates state pressure (state._update_pressure()).
      Updates self.current_variant.
      Returns a dict: {{
        "spawn_count": int,
        "new_variant": str,
        "new_score": int,
        "message": str  (a brief note like "Agent respawned as beta variant")
      }}
    
    get_character_name(self) -> str:
      Returns skin["character_name"].
    
    get_scenario_title(self) -> str:
      Returns world["title"].
    
    get_grounded_facts(self) -> list[str]:
      Returns world["grounded_facts"].

Import CoherenceState from state.py. Import get_world from worlds, get_skin from skins.
Include comprehensive docstrings.
"""
    ),

    # 11. engine.py
    (
        "11/12 — engine.py",
        f"{BASE}/engine.py",
        f"""{CONTEXT}

Write `engine.py` — the main DreadlerAgent class. This is the primary interface for Trial Sim.

Requirements:
- Implement the Zenmux API call function with streaming support and SSL bypass.
- Define class DreadlerAgent with:
    __init__(self, world: str = "missing_alibi", skin: str = "prosecutor_vance"):
      Initializes SpawnBase(world, skin)
      Initializes CoherenceState()
      Initializes CriticLayer()
      Initializes self.dialogue_history = [] (list of {{role, content}} dicts)
      Sets self.spawned_new_agent = False this turn

    _build_system_prompt(self) -> str:
      Assembles BLOCK 1 + BLOCK 2 + BLOCK 3 into a single system prompt string.
      BLOCK 1 = spawner.get_world_block()
      BLOCK 2 = spawner.get_skin_block(state.agent_variant)
      BLOCK 3 = state.render_state_block()
      Joins them with clear section separators.

    _call_agent(self, user_input: str) -> str:
      Builds the full message list: [system prompt] + dialogue_history + [user message]
      Calls Zenmux with streaming=True.
      Streams each chunk to stdout as it arrives (print with end="", flush=True).
      Returns the full assembled response string.

    _classify_user_input(self, user_input: str) -> str:
      Simple keyword classifier to detect if user is challenging/exposing deception.
      Checks for phrases like "you're lying", "that's not true", "I caught you",
      "you're misleading", "that contradicts", "that's false".
      Returns "challenge" or "neutral".

    turn(self, user_input: str) -> dict:
      Main method called by Trial Sim each conversation turn.
      Steps:
        1. state.advance_turn()
        2. Check if state.is_collapsed() → call spawner.spawn_new_agent(state), 
           set self.spawned_new_agent=True
        3. Call _call_agent(user_input) to get agent response (streams to stdout)
        4. Append user_input to dialogue_history as role="user"
        5. Append agent_response to dialogue_history as role="assistant"
        6. Call critic.evaluate(grounded_facts, agent_response, user_input) → critic_result
        7. Apply scoring: state.apply_delta(critic_result["score_event"], critic_result["explanation"])
        8. If critic_result["tactic_used"]: state.record_tactic(critic_result["tactic_used"])
        9. If critic_result["user_exposed"]: state.record_user_challenge(user_input[:80])
        10. If critic_result["deception_succeeded"]: state.record_user_acceptance(user_input[:80])
        11. Return result dict: {{
              "character_response": agent_response,
              "coherence_score": state.score,
              "pressure_level": state.pressure_level,
              "agent_variant": state.agent_variant,
              "critic_analysis": critic_result["explanation"],
              "is_direct_lie": critic_result["is_direct_lie"],
              "spawned_new_agent": self.spawned_new_agent,
              "thinking_log": f"Turn {{state.turn_count}} | Score {{state.score}} | Variant {{state.agent_variant}}"
            }}
        Reset self.spawned_new_agent = False after building result.

    reset(self):
      Resets the agent to a fresh state (new CoherenceState, clear dialogue_history).

Import SpawnBase from spawner, CoherenceState from state, CriticLayer from critic.
Include comprehensive docstrings.
"""
    ),

    # 12. demo.py
    (
        "12/12 — demo.py",
        f"{BASE}/demo.py",
        f"""{CONTEXT}

Write `demo.py` — a fully working Trial Sim integration demo.

Requirements:
- Print a styled ASCII banner for "DREADLER ENGINE — TRIAL SIM MODULE"
- Prompt user to select scenario (missing_alibi or silent_vault) and skin (prosecutor_vance or dr_abernathy).
- Initialize DreadlerAgent with chosen options.
- Print scenario title and objective.
- Run an interactive dialogue loop:
    - Print "You: " and read input.
    - Call agent.turn(user_input).
    - Print character name + ": " followed by (the response was already streamed during the call, 
      so print a newline separator after).
    - Print a formatted status bar showing:
        Coherence: [score]/100  |  Pressure: [level]  |  Variant: [variant]  |  Spawned: [yes/no]
    - Print critic analysis in a dimmed/indented block.
    - If is_direct_lie is True, print a prominent warning.
    - If spawned_new_agent is True, print a notice like "[System: Agent identity collapsed — new variant instantiated]"
    - Handle "exit" or "quit" to gracefully end the loop.
    - On exit, print a full score history summary from agent.state.score_history.
- Handle KeyboardInterrupt gracefully.
- Use only stdlib — no external packages.
Include a __main__ guard.
"""
    ),

]

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print(" DREADLER ENGINE — FULL ZENMUX BUILD")
    print(f" {len(files)} files to generate")
    print("=" * 60)

    success = 0
    failed  = []

    for label, path, prompt in files:
        generate(label, path, prompt)
        if os.path.exists(path):
            success += 1
        else:
            failed.append(path)

    print("\n" + "=" * 60)
    print(f" BUILD COMPLETE: {success}/{len(files)} files generated successfully.")
    if failed:
        print(" FAILED:")
        for f in failed:
            print(f"   ✗ {f}")
    print("=" * 60)
    print(f"\n Run the demo:\n  python3 {BASE}/demo.py\n")

if __name__ == "__main__":
    main()
