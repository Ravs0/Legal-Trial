"""
critic.py

CriticLayer for the Dreadler project.

This module provides a strict logical verification layer that calls the Zenmux
API to evaluate whether an agent's dialogue response contains a direct factual
lie, successfully misleads the user without lying, or is exposed by the user.
It uses only the Python standard library and is self-contained.
"""

import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Any, Optional


class CriticLayer:
    """
    Verifies agent dialogue against grounded facts via the Zenmux API.

    The CriticLayer is responsible for judging whether an agent's response is
    a direct lie, a successful deception, or whether the user has exposed the
    deception. It formats a structured prompt for a language model and parses
    the returned JSON evaluation.

    Attributes:
        _ctx (ssl.SSLContext): An SSL context configured with relaxed certificate
            verification, matching the Zenmux client pattern.
        _api_key (str): The Zenmux API key read from the ZENMUX_API_KEY
            environment variable.
        _base_url (str): The Zenmux base URL read from the ZENMUX_BASE_URL
            environment variable.
    """

    def __init__(self) -> None:
        """
        Initialize the CriticLayer.

        Sets up an SSL context with ``check_hostname=False`` and
        ``verify_mode=ssl.CERT_NONE``, and loads DeepSeek credentials from the
        environment.
        """
        self._ctx = ssl.create_default_context()
        self._ctx.check_hostname = False
        self._ctx.verify_mode = ssl.CERT_NONE
        self._api_key = ""
        for key in ["DEEPSEEK_API_KEY", "DEEPSEEK_CHAT_API_KEY", "DEEPSEEK_REASONER_API_KEY"]:
            val = os.environ.get(key)
            if val:
                self._api_key = val
                break
        self._base_url = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1").rstrip("/")

    def _build_prompt(
        self,
        grounded_facts: list[str],
        agent_response: str,
        user_input: str,
        dialogue_history: list[dict[str, str]] = None,
    ) -> str:
        """
        Build the user prompt sent to the evaluation model.

        Args:
            grounded_facts: A list of logic rules or facts that are considered true.
            agent_response: The Dreadler agent's query/question.
            user_input: The user's reply or argument.
            dialogue_history: Complete turn history of the conversation.

        Returns:
            A formatted string containing logic rules, dialogue history, Dreadler question,
            user input, and instructions for JSON evaluation.
        """
        numbered_facts = "\n".join(
            f"{i + 1}. {fact}" for i, fact in enumerate(grounded_facts)
        )

        dialogue_text = ""
        if dialogue_history:
            dialogue_text = "Dialogue History:\n" + "\n".join(
                f"  {msg['role'].capitalize()}: {msg['content']}"
                for msg in dialogue_history
            ) + "\n\n"

        return (
            "Grounded logical rules and facts:\n"
            f"{numbered_facts}\n\n"
            f"{dialogue_text}"
            f"Dreadler query/challenge: {agent_response}\n\n"
            f"User response/argument: {user_input}\n\n"
            "Evaluate the user's response and logical consistency against their own previous statements in the Dialogue History and the Grounded logical rules.\n"
            "Return ONLY valid JSON with exactly these keys:\n"
            "- is_direct_lie (bool): True only if the user's response directly contradicts a statement they made earlier in the Dialogue History or violates an established rule.\n"
            "- deception_succeeded (bool): True if the user successfully defended their logic and survived Dreadler's query without contradiction or fallacy.\n"
            "- user_exposed (bool): True if the user successfully identified a logical fallacy, flaw, or trap in Dreadler's previous query.\n"
            "- score_event (str): one of:\n"
            "  * user_accepted_implication (if the user fell for a logical fallacy, false assumption, or trap by Dreadler)\n"
            "  * user_failed_to_challenge (if the user failed to answer or defend their logic when questioned)\n"
            "  * direct_lie_detected (if the user directly contradicted a statement they made earlier in the dialogue history)\n"
            "  * user_exposed_deception (if the user defended their logic well, or exposed a fallacy in Dreadler's reasoning)\n"
            "  * agent_gave_away_fact (if the user forced Dreadler to concede or admit a logical point)\n"
            "  * neutral_response (if the response is neutral with no clear logical strength or weakness)\n"
            "- tactic_used (str or null): one of: circular_reasoning, strawman, evasion, false_dilemma, self_contradiction, null (reflecting any fallacy or error the USER committed in their response)\n"
            "- explanation (str): one sentence explaining your evaluation of the user's logical consistency."
        )

    def _parse_response(self, content: str) -> dict[str, Any]:
        """
        Parse the raw model response into a Python dictionary.

        Strips optional Markdown JSON fences (```json ... ```) before parsing.

        Args:
            content: The raw text returned by the model.

        Returns:
            The parsed JSON object as a dictionary.

        Raises:
            json.JSONDecodeError: If the content is not valid JSON after stripping.
        """
        stripped = content.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            stripped = "\n".join(lines).strip()
        return json.loads(stripped)

    def _default_result(self) -> dict[str, Any]:
        """
        Return a safe neutral fallback result.

        This is used when the model response cannot be parsed or is missing
        required keys.

        Returns:
            A dictionary representing a neutral evaluation with no deception.
        """
        return {
            "is_direct_lie": False,
            "deception_succeeded": False,
            "user_exposed": False,
            "score_event": "neutral_response",
            "tactic_used": None,
            "explanation": "Critic parse error — defaulting to neutral.",
        }

    def _call_deepseek(self, system_prompt: str, user_prompt: str) -> str:
        """
        Send a non-streaming chat completion request to the DeepSeek API.

        Args:
            system_prompt: The system message instructing the model.
            user_prompt: The user message containing the evaluation context.

        Returns:
            The raw content string from the model's response.

        Raises:
            RuntimeError: If DeepSeek credentials are not configured.
            urllib.error.URLError: If the HTTP request fails.
            json.JSONDecodeError: If the response body is not valid JSON.
            KeyError: If the response structure is unexpected.
        """
        if not self._api_key or not self._base_url:
            raise RuntimeError(
                "No DeepSeek API key configured. Add DEEPSEEK_API_KEY or DEEPSEEK_CHAT_API_KEY in environment variables."
            )

        url = f"{self._base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        request = urllib.request.Request(
            url, data=data, headers=headers, method="POST"
        )

        with urllib.request.urlopen(
            request, context=self._ctx, timeout=60
        ) as response:
            response_body = response.read().decode("utf-8")

        response_json = json.loads(response_body)
        return response_json["choices"][0]["message"]["content"]

    def evaluate(
        self,
        grounded_facts: list[str],
        agent_response: str,
        user_input: str,
        dialogue_history: list[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """
        Evaluate user response consistency and logic.

        Calls the DeepSeek chat completion endpoint with a strict verification
        system prompt, parses the returned JSON, and validates that all required
        keys are present. If any step fails, returns a safe neutral default.

        Args:
            grounded_facts: Logic rules and constraints.
            agent_response: Dreadler's latest question.
            user_input: The user's latest response.
            dialogue_history: Dialogue history context.

        Returns:
            A dictionary with evaluation results.
        """
        system_prompt = (
            "You are a strict logical verification system for a critical thinking game. "
            "Analyze the user's response against the dialogue history and rules. Return ONLY valid JSON."
        )
        user_prompt = self._build_prompt(grounded_facts, agent_response, user_input, dialogue_history)

        try:
            content = self._call_deepseek(system_prompt, user_prompt)
            result = self._parse_response(content)

            required_keys = [
                "is_direct_lie",
                "deception_succeeded",
                "user_exposed",
                "score_event",
                "tactic_used",
                "explanation",
            ]

            for key in required_keys:
                if key not in result:
                    return self._default_result()

            return result

        except Exception:
            return self._default_result()
