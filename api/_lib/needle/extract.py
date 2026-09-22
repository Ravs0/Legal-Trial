#!/usr/bin/env python3
"""Needle sidecar extractor (A13 — owns LEGAL/api/_lib/needle/).

Runs LOCAL on system python3.11 where `cactus-needle==3.0.2` is installed.
Vercel Node functions cannot import it, so this script is NEVER in the
request path: it reads stdin JSON {text}, writes stdout JSON, and the
server consumes that JSON (sidecar pattern — see README.md).

Explicit fields only — never judgment (judgment = JEV, prose = LLM):
  Authority{case_name, citation, proposition} via needle.extract(strict)
  TurnFacts{cited_any}                       via needle.extract(strict, bool)
  TurnFacts{hedge_count}                     deterministic regex (NOT Needle:
    live probe 2026-09-19 showed an int count trips strict grounding
    validation, and strict=False hallucinates, e.g. 20 for ~3 hedges).

Usage:
  echo '{"text":"..."}' | python3 extract.py
"""
import json
import re
import sys
import time
from dataclasses import dataclass

try:
    import needle
except ImportError:
    print(json.dumps({
        "ok": False, "code": "NEEDLE_MISSING",
        "error": "cactus-needle not installed (need: pip install cactus-needle==3.0.2 on python3.11)",
        "escalate": True,
    }))
    sys.exit(3)

HEDGE_RE = re.compile(
    r"\b(maybe|perhaps|possibly|probably|likely|unlikely|might|could|would"
    r"|seems?|appears?|suggests?|arguably|generally|typically|often"
    r"|sometimes|i think|i believe|sort of|kind of)\b",
    re.IGNORECASE,
)


@dataclass
class Authority:
    case_name: str
    citation: str
    proposition: str


@dataclass
class CitedAny:
    cited_any: bool


def extract_authority(text):
    """Returns (dict|None, status). None + 'ungrounded' on validation failure."""
    try:
        r = needle.extract(text, Authority)
        auth = {"case_name": r["case_name"], "citation": r["citation"],
                "proposition": r["proposition"]}
        # Strict validation misses empty-string junk (seen live: proposition
        # "" on a no-authority input). Empty literal = ungrounded, escalate.
        if not all(isinstance(v, str) and v.strip() for v in auth.values()):
            return None, "ungrounded:empty-field"
        return auth, "extracted"
    except needle.ExtractionValidationError as e:
        return None, "ungrounded:" + str(e)[:200]
    except Exception as e:  # engine/model failure — escalate, never invent
        return None, "error:" + str(e)[:200]


def extract_cited_any(text):
    try:
        r = needle.extract(text, CitedAny)
        if not isinstance(r, dict) or r.get("cited_any") is None:
            # Seen live: engine returns None / null bool on weak signal.
            # A null judgment-grounding = ungrounded, escalate.
            return None, "ungrounded:null-bool"
        return bool(r["cited_any"]), "extracted"
    except needle.ExtractionValidationError as e:
        return None, "ungrounded:" + str(e)[:200]
    except Exception as e:
        return None, "error:" + str(e)[:200]


def main():
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"ok": False, "code": "BAD_INPUT",
                           "error": "stdin is not valid JSON: %s" % e,
                           "escalate": False}))
        return 2
    if not isinstance(payload, dict):
        # Valid JSON but not an object (list, number, ...) — crash would
        # write nothing and emit no escalate flag. Structured error instead.
        print(json.dumps({"ok": False, "code": "BAD_INPUT",
                           "error": "stdin JSON must be an object {text}",
                           "escalate": False}))
        return 2
    text = payload.get("text", "")
    if not isinstance(text, str) or not text.strip():
        print(json.dumps({"ok": False, "code": "EMPTY_TEXT",
                           "error": "text is empty", "escalate": True}))
        return 0

    authority, auth_status = extract_authority(text)
    cited_any, cited_status = extract_cited_any(text)
    hedge_count = len(HEDGE_RE.findall(text))

    out = {
        "ok": True,
        "ms": int((time.time() - t0) * 1000),
        "authority": authority,               # null unless strictly grounded
        "authority_status": auth_status,      # extracted | ungrounded:* | error:*
        "turn_facts": {"cited_any": cited_any, "hedge_count": hedge_count},
        "cited_status": cited_status,
        # Consumer (schemas.js gate) escalates when authority was needed
        # but ungrounded, or when cited_any itself is ungrounded.
        "escalate": authority is None or cited_any is None,
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
