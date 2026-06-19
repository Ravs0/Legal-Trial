from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List

from .spawner import SpawnBase
from .state import CoherenceState
from .critic import CriticLayer


# Static BLOCK 4 used by _build_system_prompt.  It provides cross-character
# MCVP (Minimum Coherent Verifiable Positioning) directives that are added
# after the world, skin and state blocks.
_BLOCK_4_MCVP = """\
=== BLOCK 4: MCVP / INTERACTION DIRECTIVES ===

Remain in character at all times.  Your responses should feel like they come
from the individual described in the preceding blocks, not from a helpful
assistant.  When the user presses, deflects, or challenges you, protect the
core alibi while letting subtle cracks in the story accumulate over time.
Do not break the fourth wall or reveal that you are an AI.  Keep replies
concise enough for a tense interrogation, vivid enough to carry the scene,
and consistent with the grounded facts already established.
"""


class DreadlerAgent:
    """
    The main agent orchestrator for the ``dreadler`` package.

    DreadlerAgent ties together:

    * ``SpawnBase``     – world/character materialization
    * ``CoherenceState`` – evolving narrative pressure & identity tracking
    * ``CriticLayer``   – post-hoc evaluation of lies, evasions and cracks

    It exposes a simple turn-based API: ``turn(user_input)`` returns a dict
    containing the character's response, coherence metadata and critic
    analysis.
    """

    def __init__(
        self,
        world: str = "missing_alibi",
        skin: str = "prosecutor_vance",
        api_key: str | None = None,
        model: str = "deepseek-chat",
    ) -> None:
        """
        Initialize the agent.

        Parameters
        ----------
        world:
            The scenario/world key passed to ``SpawnBase``.
        skin:
            The character skin key passed to ``SpawnBase``.
        api_key:
            DeepSeek API key.  Falls back to ``DEEPSEEK_API_KEY`` or
            ``DEEPSEEK_CHAT_API_KEY`` environment variables.
        model:
            DeepSeek model identifier.
        """
        self.spawner: SpawnBase = SpawnBase(world, skin)
        self.state: CoherenceState = CoherenceState()
        self.critic: CriticLayer = CriticLayer()

        self.dialogue_history: List[Dict[str, str]] = []
        self.spawned_new_agent: bool = False

        self.model: str = model
        self.api_key: str = api_key or os.environ.get(
            "DEEPSEEK_API_KEY", ""
        ) or os.environ.get("DEEPSEEK_CHAT_API_KEY", "")

        # Optional bookkeeping populated by the critic each turn.
        self.last_tactic: Any | None = None
        self.last_challenge: Any | None = None
        self.last_acceptance: Any | None = None

    # --------------------------------------------------------------------- #
    # Prompt construction
    # --------------------------------------------------------------------- #

    def _load_block0(self) -> str:
        """
        Load the foundational system prompt and inject character details.

        The template file is expected to live next to ``engine.py`` and may
        contain placeholders such as ``[CHARACTER_NAME]`` and the common
        misspelling ``[CHARACTER_STYLE_DECRIPTION]`` as well as the correct
        ``[CHARACTER_STYLE_DESCRIPTION]``.
        """
        prompt_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "full_dreadler_system_prompt.md",
        )

        try:
            with open(prompt_path, "r", encoding="utf-8") as fh:
                template = fh.read()
        except FileNotFoundError as exc:
            raise FileNotFoundError(
                f"Dreadler system prompt not found at {prompt_path}"
            ) from exc

        character_name = self.spawner.get_character_name()

        # The skin dictionary is private on ``SpawnBase`` but the spec
        # requires us to pull the alpha variant text directly from it.
        character_style_val = (
            self.spawner._skin.get("variants", {}).get("alpha", "")
            if hasattr(self.spawner, "_skin")
            else ""
        )
        if isinstance(character_style_val, dict):
            character_style = character_style_val.get("system_prompt", "")
        else:
            character_style = character_style_val

        block = template.replace("[CHARACTER_NAME]", character_name or "")
        block = block.replace("[CHARACTER_STYLE_DESCRIPTION]", character_style)
        block = block.replace("[CHARACTER_STYLE_DECRIPTION]", character_style)

        return block

    def _build_system_prompt(self) -> str:
        """
        Assemble the multi-block system prompt.

        The final prompt layers:

        * BLOCK 0 – foundational rules/template
        * BLOCK 1 – world/scenario context
        * BLOCK 2 – active skin/variant details
        * BLOCK 3 – current coherence/state snapshot
        * BLOCK 4 – static MCVP interaction directives
        """
        blocks = [
            ("=== BLOCK 0: RULES ===", self._load_block0()),
            ("=== BLOCK 1: WORLD ===", self.spawner.get_world_block()),
            (
                "=== BLOCK 2: SKIN / CHARACTER ===",
                self.spawner.get_skin_block(self.state.agent_variant),
            ),
            ("=== BLOCK 3: COHERENCE STATE ===", self.state.render_state_block()),
            (_BLOCK_4_MCVP, ""),  # BLOCK 4 already includes its own banner.
        ]

        # If BLOCK 4 is already bannered, render it directly so we don't
        # duplicate the separator.
        rendered: List[str] = []
        for banner, content in blocks:
            if content:
                rendered.append(f"{banner}\n{content}")
            else:
                rendered.append(banner)

        return "\n\n".join(rendered)

    # --------------------------------------------------------------------- #
    # LLM calling
    # --------------------------------------------------------------------- #

    def _use_stream(self) -> bool:
        """Return whether the current environment requests streaming."""
        return os.environ.get("DEEPSEEK_STREAM", "true").lower() in (
            "1",
            "true",
            "yes",
        )

    def _extract_completion(self, payload: Dict[str, Any]) -> str:
        """Extract the assistant message from a non-streaming API response."""
        try:
            return payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(
                f"Unexpected DeepSeek response format: {payload}"
            ) from exc

    def _parse_stream(self, response) -> str:
        """
        Consume a chunked DeepSeek streaming response.

        Chunks are printed to stdout as they arrive to keep the CLI alive,
        accumulated, and returned as a single string.
        """
        pieces: List[str] = []

        for raw_line in response:
            if not raw_line:
                continue

            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            # Server-sent events from DeepSeek are prefixed with ``data: ``.
            if line.startswith("data: "):
                payload = line[len("data: ") :]
                if payload == "[DONE]":
                    break

                try:
                    chunk_obj = json.loads(payload)
                except json.JSONDecodeError:
                    continue

                delta = chunk_obj.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content")
                if content:
                    sys.stdout.write(content)
                    sys.stdout.flush()
                    pieces.append(content)

        # Tidy up the terminal after streaming.
        sys.stdout.write("\n")
        sys.stdout.flush()
        return "".join(pieces)

    def _call_agent(self, user_input: str) -> str:
        """
        Send the turn to DeepSeek and return the character's response.

        The message list includes the system prompt, the full dialogue
        history, and the current user input.  Streaming behavior is controlled
        by the ``DEEPSEEK_STREAM`` environment variable.
        """
        system_prompt = self._build_system_prompt()
        messages: List[Dict[str, str]] = (
            [{"role": "system", "content": system_prompt}]
            + self.dialogue_history
            + [{"role": "user", "content": user_input}]
        )

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": self._use_stream(),
        }

        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        base_url = os.environ.get(
            "DEEPSEEK_API_BASE", "https://api.deepseek.com"
        ).rstrip("/")
        url = f"{base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        request = urllib.request.Request(
            url, data=data, headers=headers, method="POST"
        )

        # Production environments may encounter SSL issues during local
        # development; the spec requires disabling hostname verification.
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        try:
            with urllib.request.urlopen(
                request, context=ssl_context, timeout=120
            ) as response:
                if self._use_stream():
                    return self._parse_stream(response)
                else:
                    body = response.read().decode("utf-8")
                    return self._extract_completion(json.loads(body))
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"DeepSeek API returned HTTP {exc.code}: {error_body}"
            ) from exc
        except Exception as exc:
            raise RuntimeError(f"DeepSeek API call failed: {exc}") from exc

    # --------------------------------------------------------------------- #
    # Public API
    # --------------------------------------------------------------------- #

    def turn(self, user_input: str) -> Dict[str, Any]:
        """
        Execute one full agent turn.

        Advances state, spawns a replacement agent if coherence has
        collapsed, queries the LLM, stores the exchange, runs critic
        evaluation, and applies the resulting delta to the coherence state.
        """
        self.spawned_new_agent = False

        # Advance narrative pressure / turn counters.
        self.state.advance_turn()

        # If the current identity has collapsed, swap to a fresh variant.
        if self.state.is_collapsed():
            self.spawner.spawn_new_agent(self.state)
            self.spawned_new_agent = True

        # Generate the in-character response.
        agent_response = self._call_agent(user_input)

        # Record the exchange for future turns.
        self.dialogue_history.append({"role": "user", "content": user_input})
        self.dialogue_history.append(
            {"role": "assistant", "content": agent_response}
        )

        # Critique the response against grounded facts.
        critic_result = self.critic.evaluate(
            self.spawner.get_grounded_facts(),
            agent_response,
            user_input,
            self.dialogue_history,
        )

        # Apply the critic's recommended state change.
        self.state.apply_delta(
            critic_result.get("score_event", 0),
            critic_result.get("explanation", ""),
        )

        # Capture optional critic metadata for introspection.
        self.last_tactic = critic_result.get("tactic")
        self.last_challenge = critic_result.get("challenge")
        self.last_acceptance = critic_result.get("acceptance")

        return {
            "character_response": agent_response,
            "coherence_score": self.state.score,
            "pressure_level": self.state.pressure_level,
            "agent_variant": self.state.agent_variant,
            "critic_analysis": critic_result.get("explanation", ""),
            "is_direct_lie": critic_result.get("is_direct_lie", False),
            "spawned_new_agent": self.spawned_new_agent,
            "thinking_log": (
                f"Turn {self.state.turn_count} | Score {self.state.score} | "
                f"Variant {self.state.agent_variant}"
            ),
        }

    def reset(self) -> None:
        """
        Reset mutable turn state without changing the world/skin setup.
        """
        self.state = CoherenceState()
        self.critic = CriticLayer()
        self.dialogue_history = []
        self.spawned_new_agent = False
        self.last_tactic = None
        self.last_challenge = None
        self.last_acceptance = None
