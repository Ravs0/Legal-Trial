import os
import sys
import json
import base64
import hashlib
import hmac
import threading
import time
from http.server import BaseHTTPRequestHandler

# Set up the import path for the local dreadler package
api_dir = os.path.dirname(os.path.abspath(__file__))
# api_dir is under Projects/Apps/Legal-Trial/api
# The dreadler package we copied is in Projects/Apps/Legal-Trial/dreadler
project_dir = os.path.abspath(os.path.join(api_dir, ".."))
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

from dreadler import DreadlerAgent

MAX_BODY_BYTES = 128 * 1024
MAX_INPUT_CHARS = 6_000
MAX_HISTORY_ENTRIES = 20
MAX_HISTORY_CHARS = 5_000
ALLOWED_WORLDS = {"dreadler_logic"}
ALLOWED_SKINS = {"dreadler"}
ALLOWED_PRESSURE = {"calm", "building", "high", "critical"}
ALLOWED_VARIANTS = {"alpha", "beta", "gamma"}
STATE_SECRET = os.environ.get("DREADLER_STATE_SECRET", "")
_rate_buckets: dict[str, tuple[float, int]] = {}
_rate_lock = threading.Lock()


def _allowed_origins() -> set[str]:
    configured = os.environ.get("ALLOWED_ORIGINS", os.environ.get("APP_ORIGIN", ""))
    return {
        "http://localhost:3000", "http://localhost:3001", "http://localhost:5173",
        "http://127.0.0.1:3000", "http://127.0.0.1:5173",
        *[origin.strip() for origin in configured.split(",") if origin.strip()],
    }


def _request_allowed(client_ip: str, limit: int = 30, window_seconds: int = 60) -> bool:
    now = time.monotonic()
    with _rate_lock:
        started_at, count = _rate_buckets.get(client_ip, (now, 0))
        if now - started_at >= window_seconds:
            started_at, count = now, 0
        count += 1
        _rate_buckets[client_ip] = (started_at, count)
        return count <= limit


def _encode_state(state: dict) -> str:
    encoded = json.dumps(state, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(STATE_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
    return f"{base64.urlsafe_b64encode(encoded).decode().rstrip('=')}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def _decode_state(token: object) -> dict | None:
    if not STATE_SECRET or not isinstance(token, str) or "." not in token:
        return None
    try:
        encoded_part, signature_part = token.split(".", 1)
        encoded = base64.urlsafe_b64decode(encoded_part + "=" * (-len(encoded_part) % 4))
        signature = base64.urlsafe_b64decode(signature_part + "=" * (-len(signature_part) % 4))
        expected = hmac.new(STATE_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        parsed = json.loads(encoded.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _bounded_int(value: object, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return default


def _bounded_strings(value: object, maximum_items: int = 20) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item[:200] for item in value if isinstance(item, str)][:maximum_items]


def _bounded_history(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    history: list[dict[str, str]] = []
    for entry in value[-MAX_HISTORY_ENTRIES:]:
        if not isinstance(entry, dict):
            continue
        role, content = entry.get("role"), entry.get("content")
        if role in {"user", "assistant"} and isinstance(content, str):
            history.append({"role": role, "content": content[:MAX_HISTORY_CHARS]})
    return history


def _hydrate(agent: DreadlerAgent, state: dict) -> None:
    agent.state.score = _bounded_int(state.get("score"), 100, 0, 100)
    agent.state.turn_count = _bounded_int(state.get("turn_count"), 0, 0, 200)
    agent.state.pressure_level = state.get("pressure_level") if state.get("pressure_level") in ALLOWED_PRESSURE else "calm"
    agent.state.agent_variant = state.get("agent_variant") if state.get("agent_variant") in ALLOWED_VARIANTS else "alpha"
    agent.state.used_tactics = _bounded_strings(state.get("used_tactics"))
    agent.state.accepted_by_user = _bounded_strings(state.get("accepted_by_user"))
    agent.state.challenged_by_user = _bounded_strings(state.get("challenged_by_user"))
    agent.state.score_history = [_bounded_int(item, 100, 0, 100) for item in state.get("score_history", [])[:MAX_HISTORY_ENTRIES]] if isinstance(state.get("score_history"), list) else []
    agent.spawner.spawn_count = _bounded_int(state.get("spawn_count"), 0, 0, 50)
    agent.spawner.current_variant = state.get("current_variant") if state.get("current_variant") in ALLOWED_VARIANTS else "alpha"
    agent.dialogue_history = _bounded_history(state.get("dialogue_history"))

class handler(BaseHTTPRequestHandler):
    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin in _allowed_origins()

    def send_cors_headers(self):
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, status: int, payload: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."})
            return
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."})
            return
        # Allow checking if the endpoint is alive and return configuration options
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        
        response = {
            "status": "active",
            "worlds": ["dreadler_logic"],
            "skins": ["dreadler"]
        }
        self.wfile.write(json.dumps(response).encode("utf-8"))

    def do_POST(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."})
            return
        if not _request_allowed(self.client_address[0]):
            self.send_json(429, {"error": "Too many requests. Please wait a minute and try again."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length."})
            return
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self.send_json(413, {"error": "Request body is missing or too large."})
            return
        post_data = self.rfile.read(content_length)
        
        try:
            req_body = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            self.send_json(400, {"error": "Invalid JSON body."})
            return

        action = req_body.get("action", "turn")
        world_id = req_body.get("world", "dreadler_logic")
        skin_id = req_body.get("skin", "dreadler")
        user_input = req_body.get("user_input", "")
        state_data = _decode_state(req_body.get("state_token"))

        if not STATE_SECRET:
            self.send_json(503, {"error": "DREADLER_STATE_SECRET is required to run this training simulation."})
            return
        if world_id not in ALLOWED_WORLDS or skin_id not in ALLOWED_SKINS:
            self.send_json(400, {"error": "Unsupported training scenario."})
            return

        if action == "reset":
            self.send_json(200, {"status": "reset_successful"})
            return
        if action != "turn" or not isinstance(user_input, str) or not user_input.strip() or len(user_input) > MAX_INPUT_CHARS:
            self.send_json(400, {"error": f"user_input must be 1–{MAX_INPUT_CHARS} characters."})
            return

        try:
            # Instantiate the agent
            agent = DreadlerAgent(world=world_id, skin=skin_id)

            # Only hydrate a state that was signed by this deployment. The
            # browser never gets to author scores, turns, or conversation state.
            if state_data:
                _hydrate(agent, state_data)

            # Run turn
            result = agent.turn(user_input)

            # Compile updated state
            next_state_data = {
                "score": agent.state.score,
                "turn_count": agent.state.turn_count,
                "pressure_level": agent.state.pressure_level,
                "agent_variant": agent.state.agent_variant,
                "used_tactics": agent.state.used_tactics,
                "accepted_by_user": agent.state.accepted_by_user,
                "challenged_by_user": agent.state.challenged_by_user,
                "score_history": agent.state.score_history,
                "spawn_count": agent.spawner.spawn_count,
                "current_variant": agent.spawner.current_variant,
                "dialogue_history": agent.dialogue_history,
            }

            # Prepare payload
            payload = {
                "character_response": result["character_response"],
                "coherence_score": result["coherence_score"],
                "pressure_level": result["pressure_level"],
                "agent_variant": result["agent_variant"],
                "critic_analysis": result["critic_analysis"],
                "is_direct_lie": result["is_direct_lie"],
                "spawned_new_agent": result["spawned_new_agent"],
                "thinking_log": result["thinking_log"],
                "state_data": next_state_data,
                "state_token": _encode_state(next_state_data),
            }

            self.send_json(200, payload)

        except Exception as e:
            self.send_json(500, {"error": "The training engine could not complete that turn."})
