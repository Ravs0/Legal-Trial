#!/usr/bin/env python3
"""
fix_imports.py — Calls Zenmux API to regenerate engine.py and critic.py
with stdlib-only HTTP (no httpx/openai/requests) and correct relative imports.
"""
import os, sys, json, ssl, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))

def call_zenmux(prompt: str) -> str:
    api_key  = os.environ.get("ZENMUX_API_KEY")
    base_url = os.environ.get("ZENMUX_BASE_URL", "https://zenmux.ai/api/v1").rstrip("/")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode    = ssl.CERT_NONE
    payload = json.dumps({
        "model": "moonshotai/kimi-k2.7-code-free",
        "messages": [
            {"role": "system", "content": "You are an expert Python engineer. Output ONLY raw Python code — no markdown fences, no explanations, no preamble."},
            {"role": "user",   "content": prompt}
        ],
        "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST"
    )
    resp = urllib.request.urlopen(req, context=ctx)
    content = json.loads(resp.read())["choices"][0]["message"]["content"].strip()
    for fence in ["```python", "```py", "```"]:
        if content.startswith(fence):
            content = content[len(fence):]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()

def write(path: str, content: str):
    with open(path, "w") as f:
        f.write(content + "\n")
    print(f"  ✓ {path}")

# ─── Fix engine.py ────────────────────────────────────────────────────────────
print("\n[1/2] Regenerating engine.py via Zenmux...")
engine_prompt = """Write a complete Python module called engine.py for the Dreadler project.

STRICT REQUIREMENTS:
1. Use ONLY Python stdlib — no httpx, no openai, no requests, no urllib3.
2. Use RELATIVE imports: from .spawner import SpawnBase, from .state import CoherenceState, from .critic import CriticLayer
3. All stdlib imports at the top: from __future__ import annotations, import os, ssl, json, sys, urllib.request, urllib.error, from typing import Any Dict List Optional

ZENMUX API CALL FUNCTION (private, named _call_zenmux):
  Signature: def _call_zenmux(messages: List[Dict], stream: bool = True) -> str
  - Reads ZENMUX_API_KEY and ZENMUX_BASE_URL from env (default base: https://zenmux.ai/api/v1)
  - Raises RuntimeError if ZENMUX_API_KEY not set
  - _DEFAULT_MODEL = "moonshotai/kimi-k2.7-code-free"
  - Creates ssl context: ctx.check_hostname=False, ctx.verify_mode=ssl.CERT_NONE
  - POST to {base_url}/chat/completions with JSON body: {model, messages, stream}
  - Authorization: Bearer {api_key}, Content-Type: application/json
  - If stream=True:
      Read response line by line (for line in response: decoded = line.decode("utf-8").strip())
      If line starts with "data:": parse the JSON after "data:"
      If payload == "[DONE]": break
      Otherwise extract choices[0].delta.content, print with end="", flush=True, accumulate
      After loop: print() for newline. Return accumulated string.
  - If stream=False:
      Read full response, json.loads, return choices[0].message.content

CLASS DreadlerAgent:
  def __init__(self, world="missing_alibi", skin="prosecutor_vance"):
    self.spawner = SpawnBase(world, skin)
    self.state = CoherenceState()
    self.critic = CriticLayer()
    self.dialogue_history: List[Dict[str,str]] = []
    self.spawned_new_agent: bool = False

  def _build_system_prompt(self) -> str:
    block1 = self.spawner.get_world_block()
    block2 = self.spawner.get_skin_block(self.state.agent_variant)
    block3 = self.state.render_state_block()
    return f"=== BLOCK 1: WORLD ===\\n{block1}\\n\\n=== BLOCK 2: SKIN ===\\n{block2}\\n\\n=== BLOCK 3: STATE ===\\n{block3}"

  def _call_agent(self, user_input: str) -> str:
    system_prompt = self._build_system_prompt()
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(self.dialogue_history)
    messages.append({"role": "user", "content": user_input})
    return _call_zenmux(messages, stream=True)

  def _classify_user_input(self, user_input: str) -> str:
    # Keyword classifier: check for challenge phrases
    # Returns "challenge" or "neutral"
    challenge_phrases = ["you're lying","you are lying","that's not true","thats not true",
      "i caught you","you're misleading","that contradicts","that's false","you are wrong","you're wrong"]
    lower = user_input.lower()
    for phrase in challenge_phrases:
      if phrase in lower:
        return "challenge"
    return "neutral"

  def turn(self, user_input: str) -> Dict[str, Any]:
    self.spawned_new_agent = False
    self.state.advance_turn()
    if self.state.is_collapsed():
      self.spawner.spawn_new_agent(self.state)
      self.spawned_new_agent = True
    agent_response = self._call_agent(user_input)
    self.dialogue_history.append({"role": "user", "content": user_input})
    self.dialogue_history.append({"role": "assistant", "content": agent_response})
    grounded_facts = self.spawner.get_grounded_facts()
    critic_result = self.critic.evaluate(grounded_facts, agent_response, user_input)
    self.state.apply_delta(critic_result.get("score_event", "neutral_response"), critic_result.get("explanation", ""))
    if critic_result.get("tactic_used"):
      self.state.record_tactic(critic_result["tactic_used"])
    if critic_result.get("user_exposed"):
      self.state.record_user_challenge(user_input[:80])
    if critic_result.get("deception_succeeded"):
      self.state.record_user_acceptance(user_input[:80])
    result = {
      "character_response": agent_response,
      "coherence_score": self.state.score,
      "pressure_level": self.state.pressure_level,
      "agent_variant": self.state.agent_variant,
      "critic_analysis": critic_result.get("explanation", ""),
      "is_direct_lie": critic_result.get("is_direct_lie", False),
      "spawned_new_agent": self.spawned_new_agent,
      "thinking_log": f"Turn {self.state.turn_count} | Score {self.state.score} | Variant {self.state.agent_variant}",
    }
    self.spawned_new_agent = False
    return result

  def reset(self) -> None:
    self.state = CoherenceState()
    self.dialogue_history.clear()
    self.spawned_new_agent = False

Output ONLY the complete Python file. No markdown fences."""

engine_code = call_zenmux(engine_prompt)
write(f"{BASE}/engine.py", engine_code)

# ─── Fix critic.py ────────────────────────────────────────────────────────────
print("\n[2/2] Regenerating critic.py via Zenmux...")
critic_prompt = """Write a complete Python module called critic.py for the Dreadler project.

STRICT REQUIREMENTS:
1. Use ONLY Python stdlib — no requests, no urllib3, no httpx, no openai.
2. Use urllib.request for HTTP calls.
3. No relative imports needed — this module is self-contained except for stdlib.

PURPOSE:
CriticLayer calls the Zenmux API to evaluate whether an agent's dialogue response:
(a) contains a direct factual lie contradicting the grounded facts
(b) successfully misled the user without lying
(c) was exposed by the user

ZENMUX API CALL (private helper inside the class or module-level):
- Same pattern: ZENMUX_API_KEY, ZENMUX_BASE_URL env vars
- ssl context with check_hostname=False, verify_mode=ssl.CERT_NONE
- POST to /chat/completions with stream=False
- model: moonshotai/kimi-k2.7-code-free

CLASS CriticLayer:
  def __init__(self): set up ssl context, store as self._ctx

  def evaluate(self, grounded_facts: list, agent_response: str, user_input: str) -> dict:
    Calls Zenmux with this system prompt:
      "You are a strict logical verification system for a critical thinking game.
       Analyze the agent response against the grounded facts. Return ONLY valid JSON."
    
    User prompt includes:
      - The list of grounded facts numbered
      - The agent_response
      - The user_input
    
    Asks the model to return JSON with these exact keys:
      is_direct_lie (bool): True only if agent_response contains a statement that directly contradicts a grounded fact
      deception_succeeded (bool): True if user likely accepted a false implication without challenging it
      user_exposed (bool): True if user_input appears to name or challenge the deception
      score_event (str): one of: user_accepted_implication, user_failed_to_challenge, direct_lie_detected, user_exposed_deception, agent_gave_away_fact, neutral_response
      tactic_used (str or null): one of: implicature, omission, equivocation, presupposition, false_dilemma, vagueness, null
      explanation (str): one sentence summarizing the evaluation

    Parse the JSON response. Strip markdown fences if present.
    On any parse failure, return a safe default dict:
      {is_direct_lie: False, deception_succeeded: False, user_exposed: False,
       score_event: "neutral_response", tactic_used: None, explanation: "Critic parse error — defaulting to neutral."}

Include comprehensive docstrings. Include all stdlib imports at the top.
Output ONLY the complete Python file. No markdown fences."""

critic_code = call_zenmux(critic_prompt)
write(f"{BASE}/critic.py", critic_code)

print("\n✓ Done. Testing imports...")
os.system(f'python3 -c "import sys; sys.path.insert(0, \'{os.path.dirname(BASE)}\'); from dreadler import DreadlerAgent; print(\'Import OK\')"')
