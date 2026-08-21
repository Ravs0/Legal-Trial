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
from dreadler.worlds import WORLD_IDS
from dreadler.skins import SKIN_IDS

MAX_BODY_BYTES = 128 * 1024
MAX_INPUT_CHARS = 6_000
MAX_HISTORY_ENTRIES = 20
# 20 entries × 2000 chars ≈ 40KB JSON → ~55KB base64, safely under
# MAX_BODY_BYTES. At 5000 chars the worst-case signed token exceeded the body
# limit and every subsequent turn 413'd (client could never continue).
MAX_HISTORY_CHARS = 2_000
# Derived from package registries (not hand-duplicated allow-lists).
ALLOWED_WORLDS = set(WORLD_IDS)
ALLOWED_SKINS = set(SKIN_IDS)
# Must match dreadler/state.py PRESSURE_MAP / VARIANT_MAP keys.
ALLOWED_PRESSURE = {"calm", "pressured", "desperate", "collapsed"}
ALLOWED_VARIANTS = {"alpha", "beta", "gamma", "collapsed"}
STATE_SECRET = os.environ.get("DREADLER_STATE_SECRET", "")
_rate_buckets: dict[str, tuple[float, int]] = {}
_rate_lock = threading.Lock()


def _allowed_origins() -> set[str]:
    # Keep in sync with api/security.js DEV_ORIGINS + ALLOWED_ORIGINS/APP_ORIGIN.
    configured = os.environ.get("ALLOWED_ORIGINS", os.environ.get("APP_ORIGIN", ""))
    return {
        "http://localhost:3000", "http://localhost:3001", "http://localhost:5173",
        "http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:5173",
        *[origin.strip() for origin in configured.split(",") if origin.strip()],
    }


def _request_allowed(client_ip: str, limit: int = 30, window_seconds: int = 60) -> bool:
    now = time.monotonic()
    with _rate_lock:
        # Prune expired / cap map size (warm-instance leak guard).
        if len(_rate_buckets) > 2500:
            expired = [ip for ip, (started, _) in _rate_buckets.items() if now - started >= window_seconds]
            for ip in expired:
                _rate_buckets.pop(ip, None)
            while len(_rate_buckets) >= 5000:
                _rate_buckets.pop(next(iter(_rate_buckets)), None)
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


def _bounded_float(value: object, default: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
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
    agent.state.agent_tactics = _bounded_strings(state.get("agent_tactics"), maximum_items=40)
    agent.state.accepted_by_user = _bounded_strings(state.get("accepted_by_user"))
    agent.state.challenged_by_user = _bounded_strings(state.get("challenged_by_user"))
    # score_history entries are dicts (see CoherenceState.apply_delta); the UI
    # Event Feed reads turn_count/event/delta off them. Keep dicts only —
    # coercing through _bounded_int turned every entry into a useless 100.
    raw_history = state.get("score_history")
    agent.state.score_history = [
        item for item in raw_history if isinstance(item, dict)
    ][:MAX_HISTORY_ENTRIES] if isinstance(raw_history, list) else []
    # USER skill axis (Part 5 Tier Covenant) rides the signed token.
    agent.state.skill_score = _bounded_float(state.get("skill_score"), 25.0, 0.0, 100.0)
    raw_skill_history = state.get("skill_history")
    agent.state.skill_history = [
        item for item in raw_skill_history if isinstance(item, dict)
    ][:MAX_HISTORY_ENTRIES] if isinstance(raw_skill_history, list) else []
    agent.spawner.spawn_count = _bounded_int(state.get("spawn_count"), 0, 0, 50)
    agent.spawner.current_variant = state.get("current_variant") if state.get("current_variant") in ALLOWED_VARIANTS else "alpha"
    agent.dialogue_history = _bounded_history(state.get("dialogue_history"))
    # Re-derive pressure/variant from the hydrated score: an older or partially
    # written token could carry score=5 with pressure_level="calm", which
    # suppresses is_collapsed() and prevents respawn. Then mirror the resolved
    # variant onto the spawner so BLOCK 2 matches the live band.
    agent.state._update_pressure_and_variant()
    agent.spawner.sync_variant_from_state(agent.state)

class handler(BaseHTTPRequestHandler):
    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        # Same-origin / non-browser: no Origin header → allow (no ACAO set).
        return not origin or origin in _allowed_origins()

    def send_cors_headers(self, *, allow_origin: bool = True):
        """Emit CORS only for allow-listed origins. Never reflect a denied Origin."""
        origin = self.headers.get("Origin")
        if allow_origin and origin and origin in _allowed_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        # Align with security.js default: Content-Type only (no credentials).
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, status: int, payload: dict, *, cors: bool = True):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        if cors:
            self.send_cors_headers(allow_origin=True)
        else:
            # Denied origin: still Vary, but do not set ACAO.
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def log_message(self, format: str, *args) -> None:
        # Quiet default BaseHTTPRequestHandler stderr spam on serverless.
        return

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."}, cors=False)
            return
        self.send_response(200)
        self.send_cors_headers(allow_origin=True)
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."}, cors=False)
            return
        # Allow checking if the endpoint is alive and return configuration options
        response = {
            "status": "active",
            "worlds": sorted(ALLOWED_WORLDS),
            "skins": sorted(ALLOWED_SKINS),
            "pressure_levels": sorted(ALLOWED_PRESSURE),
            "variants": sorted(ALLOWED_VARIANTS),
        }
        self.send_json(200, response)

    def do_POST(self):
        if not self._origin_allowed():
            self.send_json(403, {"error": "Origin is not allowed."}, cors=False)
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
        except Exception:
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
                # Optional monotonic turn guard: reject tokens older than the
                # client's high-water mark (stale replay / double-tab rewind).
                client_turn_raw = req_body.get("client_turn_count")
                if client_turn_raw is None:
                    client_turn_raw = req_body.get("prior_turn_count")
                if client_turn_raw is not None:
                    token_turn = _bounded_int(state_data.get("turn_count"), 0, 0, 200)
                    client_turn = _bounded_int(client_turn_raw, 0, 0, 200)
                    if token_turn < client_turn:
                        self.send_json(409, {
                            "error": (
                                "Stale state token: turn_count is behind the client "
                                "high-water mark. Restart the session."
                            ),
                        })
                        return
                _hydrate(agent, state_data)

            # NDJSON streaming: {"t":"start"} → {"t":"d","v":chunk}* →
            # {"t":"f",...full payload}. Progressive enhancement — runtimes
            # that buffer (e.g. some serverless Python hosts) deliver all
            # frames at once and the client parses them identically.
            streaming = req_body.get("stream") is True
            frame = None

            if streaming:
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.send_header("Cache-Control", "no-cache")
                self.send_cors_headers(allow_origin=True)
                self.end_headers()

                def frame(obj: dict) -> None:
                    self.wfile.write(
                        (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
                    )
                    self.wfile.flush()

                frame({"t": "start"})
                result = agent.turn(
                    user_input,
                    on_delta=lambda chunk: frame({"t": "d", "v": chunk}),
                )
            else:
                result = agent.turn(user_input)

            # Compile updated state
            next_state_data = {
                "score": agent.state.score,
                "turn_count": agent.state.turn_count,
                "pressure_level": agent.state.pressure_level,
                "agent_variant": agent.state.agent_variant,
                "used_tactics": agent.state.used_tactics,
                "agent_tactics": agent.state.agent_tactics,
                "accepted_by_user": agent.state.accepted_by_user,
                "challenged_by_user": agent.state.challenged_by_user,
                "score_history": agent.state.score_history,
                "skill_score": agent.state.skill_score,
                "skill_history": agent.state.skill_history,
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
                "agent_tactic": result["agent_tactic"],
                "spawned_new_agent": result["spawned_new_agent"],
                "skill_score": result["skill_score"],
                "tier": result["tier"],
                "tier_changed": result["tier_changed"],
                "tier_notice": result["tier_notice"],
                "thinking_log": result["thinking_log"],
                "state_data": next_state_data,
                "state_token": _encode_state(next_state_data),
            }

            if streaming:
                frame({"t": "f", **payload})
            else:
                self.send_json(200, payload)

        except Exception as e:
            message = str(e)
            # Log internal detail server-side only — never include stack/message in JSON.
            print(f"[dreadler] turn failure: {type(e).__name__}: {message[:300]}", flush=True)
            key_missing = "DEEPSEEK_API_KEY_MISSING" in message or "No DeepSeek API key" in message
            if frame is not None:
                # Headers are already sent — surface the failure as a frame.
                error_text = (
                    "DEEPSEEK_API_KEY is not configured on the server. "
                    "Add it in Vercel environment variables to run Dreadler."
                ) if key_missing else "The training engine could not complete that turn."
                try:
                    frame({"t": "e", "error": error_text})
                except Exception:
                    pass
                return
            if key_missing:
                self.send_json(503, {
                    "error": "DEEPSEEK_API_KEY is not configured on the server. "
                             "Add it in Vercel environment variables to run Dreadler."
                })
                return
            self.send_json(500, {"error": "The training engine could not complete that turn."})
