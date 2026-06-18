import os
import sys
import json
import ssl
from http.server import BaseHTTPRequestHandler

# Set up the import path for the local dreadler package
api_dir = os.path.dirname(os.path.abspath(__file__))
# api_dir is under Projects/Apps/Legal-Trial/api
# The dreadler package we copied is in Projects/Apps/Legal-Trial/dreadler
project_dir = os.path.abspath(os.path.join(api_dir, ".."))
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

# Ensure Zenmux environment variables are configured
# Vercel deploys may not inherit local zsh variables directly,
# but we can look for local system fallback if running on local dev
if not os.environ.get("ZENMUX_API_KEY"):
    # Attempt to load from parent directories if a .env exists
    for path in [project_dir, os.path.dirname(project_dir), os.path.dirname(os.path.dirname(project_dir))]:
        env_file = os.path.join(path, ".env")
        if os.path.exists(env_file):
            try:
                with open(env_file, "r") as f:
                    for line in f:
                        if line.strip() and not line.startswith("#"):
                            k, v = line.strip().split("=", 1)
                            os.environ[k.strip()] = v.strip().strip('"').strip("'")
            except Exception:
                pass

from dreadler import DreadlerAgent

class handler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # Allow checking if the endpoint is alive and return configuration options
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        
        response = {
            "status": "active",
            "worlds": ["missing_alibi", "silent_vault"],
            "skins": ["prosecutor_vance", "dr_abernathy"]
        }
        self.wfile.write(json.dumps(response).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_body = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Invalid JSON body: {str(e)}"}).encode("utf-8"))
            return

        action = req_body.get("action", "turn")
        world_id = req_body.get("world", "missing_alibi")
        skin_id = req_body.get("skin", "prosecutor_vance")
        user_input = req_body.get("user_input", "")
        state_data = req_body.get("state_data", None)

        if action == "reset":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "reset_successful"}).encode("utf-8"))
            return

        try:
            # Instantiate the agent
            agent = DreadlerAgent(world=world_id, skin=skin_id)

            # Hydrate state if sent by the client
            if state_data:
                agent.state.score = int(state_data.get("score", 100))
                agent.state.turn_count = int(state_data.get("turn_count", 0))
                agent.state.pressure_level = state_data.get("pressure_level", "calm")
                agent.state.agent_variant = state_data.get("agent_variant", "alpha")
                agent.state.used_tactics = list(state_data.get("used_tactics", []))
                agent.state.accepted_by_user = list(state_data.get("accepted_by_user", []))
                agent.state.challenged_by_user = list(state_data.get("challenged_by_user", []))
                agent.state.score_history = list(state_data.get("score_history", []))
                agent.spawner.spawn_count = int(state_data.get("spawn_count", 0))
                agent.spawner.current_variant = state_data.get("current_variant", "alpha")
                agent.dialogue_history = list(state_data.get("dialogue_history", []))

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
                "state_data": next_state_data
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
