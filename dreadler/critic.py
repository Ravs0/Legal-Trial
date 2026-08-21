"""
critic.py

CriticLayer for the Dreadler project.

This module provides a strict logical verification layer that calls the
DeepSeek API to evaluate whether an agent's dialogue response contains a direct factual
lie, successfully misleads the user without lying, or is exposed by the user.
It uses only the Python standard library and is self-contained.
"""

import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Any, Optional


#: Canonical score_event vocabulary. Must stay in lockstep with the keys of
#: dreadler.state.DELTA — dreadler/test_critic_contract.py asserts that equality,
#: so drift between this set and DELTA fails the contract test.
VALID_SCORE_EVENTS: frozenset[str] = frozenset({
    "user_accepted_implication",
    "user_failed_to_challenge",
    "direct_lie_detected",
    "user_exposed_deception",
    "agent_gave_away_fact",
    "neutral_response",
})

#: Agent-gain events (positive coherence delta). A user_exposed=True verdict can
#: never coexist with one of these — exposure is a hit on the agent by definition.
AGENT_GAIN_EVENTS: frozenset[str] = frozenset({
    "user_accepted_implication",
    "user_failed_to_challenge",
})

#: Player fallacy ids accepted by the critic prompt (feeds the fallacy ledger).
VALID_TACTICS: frozenset[str] = frozenset({
    "circular_reasoning",
    "strawman",
    "evasion",
    "false_dilemma",
    "self_contradiction",
})

#: §2.x deception tactics the AGENT may deploy (full_dreadler_system_prompt.md).
#: The critic classifies which one the agent's last line primarily used so the
#: player can be taught to name the manoeuvre (training objective, memo §1).
VALID_AGENT_TACTICS: frozenset[str] = frozenset({
    "implicature",              # 2.1
    "omission",                 # 2.2
    "equivocation",             # 2.3
    "presupposition",           # 2.4
    "false_dilemma",            # 2.5
    "contextual_displacement",  # 2.6
    "ambiguity",                # 2.7
    "quantifier_manipulation",  # 2.8
    "selective_quotation",      # 2.9
    "framing",                  # 2.10
})


def reconcile(result: dict[str, Any]) -> dict[str, Any]:
    """Enforce internal consistency on a raw critic JSON verdict.

    The evaluation model can return self-contradictory or out-of-vocabulary
    fields. Downstream, engine._apply_critic_result applies score_event via
    state.apply_delta, which raises ValueError on unknown keys — an unguarded
    bad value would crash the turn with HTTP 500. Reconciliation guarantees:

      * score_event is always a valid DELTA key (unknown → neutral_response)
      * is_direct_lie=True always lands a direct_lie_detected hit (a detected
        lie with a neutral/positive event would score nothing)
      * user_exposed=True never coexists with an agent-gain event
      * tactic_used is either a known player fallacy id or None

    Mutates and returns the result dict.
    """
    # Coerce booleans: the model may return "true"/1 instead of real booleans.
    result["is_direct_lie"] = bool(result.get("is_direct_lie"))
    result["deception_succeeded"] = bool(result.get("deception_succeeded"))
    result["user_exposed"] = bool(result.get("user_exposed"))

    score_event = result.get("score_event")
    if score_event not in VALID_SCORE_EVENTS:
        result["score_event"] = "neutral_response"
    score_event = result["score_event"]

    if result["is_direct_lie"] and score_event != "direct_lie_detected":
        result["score_event"] = "direct_lie_detected"
    elif result["user_exposed"] and score_event in AGENT_GAIN_EVENTS:
        result["score_event"] = "user_exposed_deception"

    tactic = result.get("tactic_used")
    if tactic not in VALID_TACTICS:
        result["tactic_used"] = None

    agent_tactic = result.get("agent_tactic")
    if agent_tactic not in VALID_AGENT_TACTICS:
        result["agent_tactic"] = None

    return result


class CriticLayer:
    """
    Verifies agent dialogue against grounded facts via the DeepSeek API.

    The CriticLayer is responsible for judging whether an agent's response is
    a direct lie, a successful deception, or whether the user has exposed the
    deception. It formats a structured prompt for a language model and parses
    the returned JSON evaluation.

    Attributes:
        _ctx (ssl.SSLContext): An SSL context configured with relaxed certificate
            verification.
        _api_key (str): The DeepSeek API key read from the environment.
        _base_url (str): The DeepSeek base URL read from the environment.
    """

    def __init__(self) -> None:
        """
        Initialize the CriticLayer.

        Uses the platform certificate store and loads DeepSeek credentials from
        the environment.
        """
        self._ctx = ssl.create_default_context()
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
            "Grounded logical rules and facts (authoritative truth for Dreadler):\n"
            f"{numbered_facts}\n\n"
            f"{dialogue_text}"
            f"Dreadler's last query/challenge (agent): {agent_response}\n\n"
            f"Investigator's latest response (user/player): {user_input}\n\n"
            "This is a critical-thinking duel. Score tracks DREADLER'S coherence "
            "(100 = cover/interrogation stance solid; 0 = collapsed). "
            "Player hits LOWER the score. Dreadler recovery RAISES the score.\n\n"
            "Evaluate BOTH sides:\n"
            "1) Did Dreadler's last line contradict grounded facts or invent false facts?\n"
            "2) Did the investigator expose a fallacy/trap in Dreadler's line?\n"
            "3) Did the investigator fall for a trap, refuse to answer, or commit a fallacy?\n\n"
            "Return ONLY valid JSON with exactly these keys:\n"
            "- is_direct_lie (bool): True only if DREADLER's last response asserts a fact "
            "that contradicts the grounded rules/facts (a real factual lie by the agent).\n"
            "- deception_succeeded (bool): True if Dreadler preserved its stance and the "
            "investigator failed to land a clean logical hit (trap worked or weak reply).\n"
            "- user_exposed (bool): True if the investigator clearly exposed a fallacy, "
            "presupposition trap, contradiction, or forced a concession in Dreadler's line.\n"
            "- score_event (str): exactly one of:\n"
            "  * user_accepted_implication — investigator fell for Dreadler's trap/false "
            "presupposition (Dreadler gains ground)\n"
            "  * user_failed_to_challenge — investigator dodged, non-answered, or failed "
            "to defend when pressed (Dreadler holds/gains)\n"
            "  * direct_lie_detected — investigator caught Dreadler in a direct factual lie "
            "against grounded facts (hard hit on Dreadler)\n"
            "  * user_exposed_deception — investigator exposed a fallacy or truth-preserving "
            "deception tactic (hit on Dreadler)\n"
            "  * agent_gave_away_fact — Dreadler was forced to concede material truth "
            "(hit on Dreadler)\n"
            "  * neutral_response — no clear hit either way\n"
            "- tactic_used (str or null): if the INVESTIGATOR committed a fallacy, one of "
            "circular_reasoning, strawman, evasion, false_dilemma, self_contradiction; "
            "else null. (This feeds the player fallacy ledger, not agent tactics.)\n"
            "- agent_tactic (str or null): the ONE §2.x deceptive tactic DREADLER's last "
            "response primarily relied on. Exactly one of: implicature, omission, "
            "equivocation, presupposition, false_dilemma, contextual_displacement, "
            "ambiguity, quantifier_manipulation, selective_quotation, framing. "
            "Null only if the line was a plain factual answer with no deceptive "
            "manoeuvre. (This names the manoeuvre for the player's training debrief.)\n"
            "- explanation (str): one sentence on who scored the hit and why."
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
            "agent_tactic": None,
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
            "You are a strict logical verification system for a critical thinking duel. "
            "Score tracks Dreadler's coherence. Detect agent factual lies against grounded "
            "facts, investigator exposures of fallacies, and investigator fallacies/traps. "
            "Return ONLY valid JSON."
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
                "agent_tactic",
                "explanation",
            ]

            for key in required_keys:
                if key not in result:
                    return self._default_result()

            return reconcile(result)

        except Exception:
            return self._default_result()
