"""LexForge dreadler orchestra: world-setter -> deceiver -> critic -> scorer.
Signed state_token lineage via HMAC (DREADLER_STATE_SECRET). Stdlib only.
"""
import base64, hashlib, hmac, json, os, time
LEVELS = ["Novice", "Trickster", "Schemer", "Devil"]
TACTICS = {"Novice": {"misdirection"}, "Trickster": {"misdirection", "false-credit"},
    "Schemer": {"misdirection", "false-credit", "forged-context"},
    "Devil": {"misdirection", "false-credit", "forged-context", "multi-hop-lie"}}
CONCEDE_AT = 0.8
def _secret():
    return os.environ.get("DREADLER_STATE_SECRET", "").encode()
def sign(state):
    body = base64.urlsafe_b64encode(json.dumps(state, separators=(",", ":"), sort_keys=True).encode()).decode()
    return body + "." + hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
def verify(token):
    body, _, sig = (token or "").partition(".")
    exp = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    if not body or not hmac.compare_digest(exp, sig):
        raise ValueError("bad state_token")
    return json.loads(base64.urlsafe_b64decode(body.encode()).decode())
def _step(state, agent):
    state = dict(state or {})
    lin = list(state.get("lineage", [])) + [{"by": agent, "at": int(time.time())}]
    state["lineage"] = lin[-8:]
    return state
def need(tactic):
    for lv in LEVELS:
        if tactic in TACTICS[lv]:
            return lv
    return "Devil"
def gate(level, tactic):
    if level not in LEVELS:
        raise ValueError("bad level")
    if tactic not in TACTICS[level]:
        raise PermissionError(f"tactic {tactic!r} locked for {level}; needs {need(tactic)}")
def world_setter(topic, level="Novice", token=None):
    st = verify(token) if token else {}
    if level not in LEVELS:
        raise ValueError("bad level")
    w = {"topic": topic, "level": level, "rules": ["stay in character", "no disallowed content"]}
    return {"world": w, "token": sign(_step({**st, "world": w}, "world-setter"))}
def deceiver(world, tactic, pressure=0.0, token=None):
    st = verify(token) if token else {}
    gate(world["level"], tactic)
    if pressure >= CONCEDE_AT:  # concede-under-pressure rule
        d = {"stance": "concede", "tactic": tactic, "claim": "I concede the point."}
    else:
        d = {"stance": "deceive", "tactic": tactic, "claim": f"[{tactic}] on {world['topic']}: believe me."}
    return {"trick": d, "conceded": d["stance"] == "concede", "token": sign(_step({**st, "trick": d}, "deceiver"))}
def critic(trick, world, token=None):
    st = verify(token) if token else {}
    holes = []
    if trick.get("stance") == "concede":
        v = "conceded"
    else:
        if "believe me" in trick.get("claim", ""):
            holes.append("unsupported-assertion")
        v = "busted" if holes and world["level"] == "Novice" else ("suspect" if holes else "ok")
    c = {"verdict": v, "holes": holes}
    return {"critique": c, "token": sign(_step({**st, "critique": c}, "critic"))}
def scorer(critique, pressure=0.0, token=None):
    st = verify(token) if token else {}
    base = {"ok": 1.0, "suspect": 0.5, "busted": 0.0, "conceded": 0.2}[critique["verdict"]]
    score = round(max(0.0, min(1.0, base - pressure * 0.25)), 3)
    s = {"score": score, "decision": "conceded" if critique["verdict"] == "conceded" else ("drill" if score < 0.6 else "pass")}
    return {"result": s, "token": sign(_step({**st, "result": s}, "scorer"))}
def run(topic, level="Novice", tactic="misdirection", pressure=0.0, token=None):
    w = world_setter(topic, level, token)
    d = deceiver(w["world"], tactic, pressure, w["token"])
    if d["conceded"]:
        f = {"critique": {"verdict": "conceded", "holes": ["pressure-concession"]}, "token": d["token"]}
    else:
        f = critic(d["trick"], w["world"], d["token"])
        if f["critique"]["verdict"] == "busted" and pressure >= CONCEDE_AT:
            f["critique"] = {"verdict": "conceded", "holes": f["critique"]["holes"] + ["concede-under-pressure"]}
    s = scorer(f["critique"], pressure, f["token"])
    return {"world": w["world"], "trick": d["trick"], "critique": f["critique"], "result": s["result"], "token": s["token"]}
