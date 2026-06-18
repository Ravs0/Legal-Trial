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


_DEFAULT_MODEL = "moonshotai/kimi-k2.7-code-free"


def _call_zenmux(messages: List[Dict], stream: bool = True) -> str:
    api_key = os.environ.get("ZENMUX_API_KEY")
    if not api_key:
        raise RuntimeError("ZENMUX_API_KEY environment variable not set")

    base_url = os.environ.get("ZENMUX_BASE_URL", "https://zenmux.ai/api/v1")

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
        raise RuntimeError(f"ZenMux API error: {e.code} {e.reason}\n{error_body}")

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
    def __init__(self, world="missing_alibi", skin="prosecutor_vance"):
        self.spawner = SpawnBase(world, skin)
        self.state = CoherenceState()
        self.critic = CriticLayer()
        self.dialogue_history: List[Dict[str, str]] = []
        self.spawned_new_agent: bool = False

    def _build_system_prompt(self) -> str:
        block1 = self.spawner.get_world_block()
        block2 = self.spawner.get_skin_block(self.state.agent_variant)
        block3 = self.state.render_state_block()
        return f"=== BLOCK 1: WORLD ===\n{block1}\n\n=== BLOCK 2: SKIN ===\n{block2}\n\n=== BLOCK 3: STATE ===\n{block3}"

    def _call_agent(self, user_input: str) -> str:
        system_prompt = self._build_system_prompt()
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.dialogue_history)
        messages.append({"role": "user", "content": user_input})
        return _call_zenmux(messages, stream=True)

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
