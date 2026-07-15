"""Vision backend — FastAPI WebSocket endpoint for the mobile (streamed) path.

The phone uplinks low-res JPEG face crops; this server extracts an averaged RGB
sample per frame, runs POS over a sliding window for BPM, and runs HSEmotion
for emotions. It pushes {bpm, emotions, ...} JSON updates back to the phone.

Owner-only by construction: bind to localhost and require a non-empty
BIO_WS_TOKEN. Never expose this service directly to a LAN or the internet.

Run:
  BIO_WS_TOKEN=replace-me uvicorn vision.backend.server:app --host 127.0.0.1 --port 8787
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import deque
from typing import Deque, List, Optional

import numpy as np

try:
    import cv2
    _HAS_CV2 = True
except Exception:  # pragma: no cover
    _HAS_CV2 = False

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from pos import pos_estimate, RgbSample, DEFAULT_FPS  # type: ignore
import hsemotion  # type: ignore

app = FastAPI(title="Legal-Trial vision backend")

OWNER_TOKEN = os.environ.get("BIO_WS_TOKEN", "")
MAX_FRAME_BYTES = 128 * 1024
BUFFER_SEC = 10
MAX_BUFFER = int(BUFFER_SEC * DEFAULT_FPS)

# AffectNet class order (mirrors vision/shared/emotion-keys.ts).
CLASS_ORDER = hsemotion.AFFECTNET_CLASS_ORDER


@app.get("/health")
async def health():
    return {
        "status": "active",
        "cv2": _HAS_CV2,
        "hsemotion": hsemotion.is_available(),
        "auth_required": True,
    }


@app.websocket("/ws/biometrics")
async def ws_biometrics(ws: WebSocket):
    """One connection = one user session = one ring buffer of RGB samples."""
    # A token is mandatory: biometric frames must never be accepted anonymously.
    token = ws.headers.get("x-owner-token") or ws.query_params.get("token")
    if not OWNER_TOKEN or token != OWNER_TOKEN:
        await ws.close(code=4401)
        return

    await ws.accept()
    buf: Deque[RgbSample] = deque(maxlen=MAX_BUFFER)
    last_emotion_at = 0.0
    last_bpm: Optional[float] = None
    EMOTION_INTERVAL = 1.5

    try:
        while True:
            raw = await ws.receive_bytes()
            if len(raw) > MAX_FRAME_BYTES:
                await ws.close(code=1009)
                return
            sample = _frame_to_sample(raw)
            if sample is None:
                continue
            buf.append(sample)

            # POS: cheap, run every frame over the buffer.
            res = pos_estimate(list(buf))
            if res.bpm is not None:
                last_bpm = res.bpm
            bpm = res.bpm if res.bpm is not None else last_bpm

            # HSEmotion: heavy, throttle to ~0.6 Hz.
            emotions: List[float] = []
            now = time.time()
            if hsemotion.is_available() and (now - last_emotion_at) >= EMOTION_INTERVAL:
                last_emotion_at = now
                crop = _decode_face_crop(raw)
                if crop is not None:
                    probs = hsemotion.infer(crop)
                    if probs:
                        emotions = probs

            dominant = _dominant(emotions) if emotions else "Neutral"

            await ws.send_text(json.dumps({
                "bpm": round(bpm, 1) if bpm is not None else None,
                "snr": round(res.snr, 2),
                "confidence": round(res.confidence, 3),
                "emotions": [round(p, 4) for p in emotions],
                "pupilMm": None,   # not derived server-side
                "dominant": dominant,
            }))
            # Yield to the event loop between frames.
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        return
    except Exception as e:  # pragma: no cover
        print(f"[ws] error: {e}")
        try:
            await ws.close()
        except Exception:
            pass


def _frame_to_sample(raw: bytes) -> Optional[RgbSample]:
    """Decode a JPEG blob to an averaged RGB sample."""
    if not _HAS_CV2:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    # cv2 returns BGR; convert for consistency with the RGB pipeline.
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    # Average the central band (forehead+cheek), matching roi.ts.
    h, w = img.shape[:2]
    crop = img[int(h * 0.18):int(h * 0.58), int(w * 0.30):int(w * 0.70)]
    if crop.size == 0:
        crop = img
    mean = crop.reshape(-1, 3).mean(axis=0)
    return RgbSample(t=time.time(), r=float(mean[0]), g=float(mean[1]), b=float(mean[2]))


def _decode_face_crop(raw: bytes) -> Optional[np.ndarray]:
    """Decode a JPEG blob to a 224x224 RGB face crop for HSEmotion."""
    if not _HAS_CV2:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return cv2.resize(img, (224, 224))


def _dominant(probs: List[float]) -> str:
    idx = int(np.argmax(probs))
    return CLASS_ORDER[idx] if idx < len(CLASS_ORDER) else "Neutral"
