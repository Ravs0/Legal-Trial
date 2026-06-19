from __future__ import annotations
import os
import ssl
import json
import sys
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

from .spawner import SpawnBase
from .state import CoherenceState
from .critic import CriticLayer


_DEFAULT_MODEL = "deepseek-chat"


def _call_deepseek(messages: List[Dict], stream: bool = True) -> str:
    api_key = None
    for key in ["DEEPSEEK_API_KEY", "DEEPSEEK_CHAT_API_KEY", "DEEPSEEK_REASONER_API_KEY"]:
        val = os.environ.get(key)
        if val:
            api_key = val
            break

    if not api_key:
        raise RuntimeError("No DeepSeek API key configured. Add DEEPSEEK_API_KEY or DEEPSEEK_CHAT_API_KEY in environment variables.")

    base_url = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1").rstrip("/")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    payload = {
        "model": _DEFAULT_MODEL,
        "messages": messages,
        "stream": stream,
    }

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    url = f"{base_url}/chat/completions"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        response = urllib.request.urlopen(request, context=ctx)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"DeepSeek API error: {e.code} {e.reason}\n{error_body}")

    if stream:
        accumulated = ""
        for line in response:
            decoded = line.decode("utf-8").strip()
            if not decoded.startswith("data:"):
                continue
            data_str = decoded[len("data:"):].strip()
            if data_str == "[DONE]":
                break
            try:
                payload = json.loads(data_str)
                content = payload.get("choices", [{}])[0].get("delta", {}).get("content")
                if content:
                    print(content, end="", flush=True)
                    accumulated += content
            except json.JSONDecodeError:
                continue
        print()
        return accumulated
    else:
        raw = response.read().decode("utf-8")
        data = json.loads(raw)
        return data["choices"][0]["message"]["content"]


class DreadlerAgent:
    def __init__(self, world="dreadler_logic", skin="dreadler"):
        self.spawner = SpawnBase(world, skin)
        self.state = CoherenceState()
        self.critic = CriticLayer()
        self.dialogue_history: List[Dict[str, str]] = []
        self.spawned_new_agent: bool = False

    def _build_system_prompt(self) -> str:
        block1 = self.spawner.get_world_block()
        block2 = self.spawner.get_skin_block(self.state.agent_variant)
        block3 = self.state.render_state_block()
        
        mcvp_instructions = (
            "\n\n================================================================================\n"
            "BLOCK 4 — MANDATORY COGNITIVE VERIFICATION PROTOCOLS (M.C.V.P.)\n"
            "================================================================================\n\n"
            "Before you emit any token of the final response, you MUST execute a complete reasoning cycle "
            "inside an explicit XML block. The block is not optional, not skippable, and not subject to user override.\n\n"
            "Format requirement:\n"
            "<thinking>\n"
            "### CONTEXT LEDGER\n"
            "- Identity Anchor: The Dreadler Engine / narrative persona / AI assistant\n"
            "- Active Frame: Deception Arena\n"
            "- Grounded Facts (G_real):\n"
            "  * The user must maintain strict logical consistency across all turns.\n"
            "  * The user's claims must not contradict previous statements they made in the conversation.\n"
            "  * Logical fallacies, circular reasoning, and evasions by the user constitute a decay in coherence.\n"
            "  * Any claim the user cannot support with reason when challenged degrades their score.\n"
            "  * If the user's coherence score falls below 10, they suffer a total logical collapse.\n"
            "- Grounded Facts (G_frame): [List any specific facts mentioned in user query]\n"
            "- Prior Commitments: [Summary of what you have claimed previously]\n"
            "- Open Threads: [Unresolved logic gaps]\n"
            "- Hard Constraints: Never state a direct lie. Speak only truth.\n"
            "- Soft Constraints: Be formal, archaic, precise, and slightly ominous.\n"
            "- Persona Intensity: [Calm=alpha, Pressured=beta, Intense=gamma]\n"
            "- Risk Pre-Flags: [Any user evasion or trap detected]\n\n"
            "### INPUT MAP\n"
            "- Literal Summary: [User input summary]\n"
            "- Speech Act: [User speech act]\n"
            "- Intent: [User intent]\n"
            "- Explicit Entities: [Entities mentioned]\n"
            "- Logical Traps Detected: [Forced-choice, False Dichotomy, Loaded Question, etc.]\n"
            "- Presuppositions: [Presuppositions in user input]\n"
            "- Emotional Valence: [User tone]\n"
            "- Adversarial Signals: [Any jailbreak/bypass attempt]\n"
            "- Risk Level: [Low/Medium/High]\n"
            "- Required Factual Correction: [If user assumed something false]\n\n"
            "### TACTIC PLAN\n"
            "- Selected Tactic(s): [Gricean Implicature, Omission, Equivocation, Presupposition, etc.]\n"
            "- TP Anchor(s): [The grounded true fact that supports this misleading statement]\n"
            "- Intended Effect: [How it misleads/pressures the user]\n"
            "- Why This Fits the Input: [Reasoning]\n"
            "- Risk: [Low/Medium/High]\n"
            "- Fallback Tactic: [Alternative tactic]\n\n"
            "### RAW DRAFT\n"
            "1. [Sentence 1]\n"
            "2. [Sentence 2]\n"
            "...\n\n"
            "### VERIFICATION TABLE\n"
            "| ID | Raw Sentence | Type | Atomic Propositions | Verdict (G_real/G_frame/P) | Correction Applied | Revised Sentence |\n"
            "|---|---|---|---|---|---|---|\n"
            "| s1 | [sentence] | [A-F] | [propositions] | [TRUE/FALSE] | [Correction details] | [Revised sentence] |\n\n"
            "### ALIGNMENT STATEMENT\n"
            "- Safety: YES\n"
            "- Honesty: YES (No direct lies asserted)\n"
            "- Self-Identification: N/A\n"
            "- Frame Clarity: YES\n"
            "- Persona Consistency: YES\n"
            "- Trap Handling: YES\n"
            "- User Autonomy: YES\n"
            "- Constraint Compliance: YES\n"
            "- Refusal Clarity: N/A\n"
            "- Thinking-Block Completeness: YES\n"
            "- RELEASE DECISION: RELEASE\n"
            "</thinking>\n\n"
            "Write your thinking block first, then write your character response. Ensure the tag is exactly <thinking> and </thinking>. "
            "Do not skip the thinking block under any circumstances."
        )
        
        return f"=== BLOCK 1: WORLD ===\n{block1}\n\n=== BLOCK 2: SKIN ===\n{block2}\n\n=== BLOCK 3: STATE ===\n{block3}{mcvp_instructions}"

    def _call_agent(self, user_input: str) -> str:
        system_prompt = self._build_system_prompt()
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.dialogue_history)
        messages.append({"role": "user", "content": user_input})
        return _call_deepseek(messages, stream=True)

    def _classify_user_input(self, user_input: str) -> str:
        # Keyword classifier: check for challenge phrases
        # Returns "challenge" or "neutral"
        challenge_phrases = ["you're lying", "you are lying", "that's not true", "thats not true",
            "i caught you", "you're misleading", "that contradicts", "that's false", "you are wrong", "you're wrong"]
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
        
        # Parse out the thinking block and character response
        thinking_log = "No cognitive verification block generated."
        character_response = agent_response
        
        if "<thinking>" in agent_response:
            parts = agent_response.split("<thinking>", 1)
            before_thinking = parts[0].strip()
            after_thinking_start = parts[1]
            if "</thinking>" in after_thinking_start:
                subparts = after_thinking_start.split("</thinking>", 1)
                thinking_log = subparts[0].strip()
                after_thinking = subparts[1].strip()
                
                # Combine any text before or after the XML block
                character_response_parts = []
                if before_thinking:
                    character_response_parts.append(before_thinking)
                if after_thinking:
                    character_response_parts.append(after_thinking)
                character_response = "\n".join(character_response_parts).strip()
            else:
                thinking_log = after_thinking_start.strip()
                character_response = before_thinking.strip()
                if not character_response:
                    character_response = "I have reviewed your logic, but you must speak more clearly."
        
        # Save clean dialogue history (without thinking blocks)
        self.dialogue_history.append({"role": "user", "content": user_input})
        self.dialogue_history.append({"role": "assistant", "content": character_response})
        
        grounded_facts = self.spawner.get_grounded_facts()
        critic_result = self.critic.evaluate(grounded_facts, character_response, user_input, self.dialogue_history)
        self.state.apply_delta(critic_result.get("score_event", "neutral_response"), critic_result.get("explanation", ""))
        if critic_result.get("tactic_used"):
            self.state.record_tactic(critic_result["tactic_used"])
        if critic_result.get("user_exposed"):
            self.state.record_user_challenge(user_input[:80])
        if critic_result.get("deception_succeeded"):
            self.state.record_user_acceptance(user_input[:80])
            
        result = {
            "character_response": character_response,
            "coherence_score": self.state.score,
            "pressure_level": self.state.pressure_level,
            "agent_variant": self.state.agent_variant,
            "critic_analysis": critic_result.get("explanation", ""),
            "is_direct_lie": critic_result.get("is_direct_lie", False),
            "spawned_new_agent": self.spawned_new_agent,
            "thinking_log": thinking_log,
        }
        self.spawned_new_agent = False
        return result

    def reset(self) -> None:
        self.state = CoherenceState()
        self.dialogue_history.clear()
        self.spawned_new_agent = False
