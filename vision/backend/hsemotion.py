"""HSEmotion inference (EfficientNet-B0 / AffectNet8) via ONNX Runtime.

Loads the published HSEmotion weights once and classifies 224x224 face crops
into the 8 AffectNet categories. Mirrors the class order used by the browser
side (vision/shared/emotion-keys.ts AFFECTNET_CLASS_ORDER). If the model file
is missing, the module is a no-op (emotions come back empty), so the backend
degrades to POS-only just like the laptop path.
"""
from __future__ import annotations

import os
from typing import List, Optional

import numpy as np

try:
    import onnxruntime as ort
    _HAS_ORT = True
except Exception:  # pragma: no cover - onnxruntime optional
    _HAS_ORT = False

# AffectNet 8-class order — must match vision/shared/emotion-keys.ts.
AFFECTNET_CLASS_ORDER = [
    "Neutral", "Happy", "Sad", "Surprise",
    "Fear", "Disgust", "Anger", "Contempt",
]

_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "hsemotion_effnet_b0_affectnet.onnx",
)

_session = None
_session_checked = False


def is_available() -> bool:
    return _get_session() is not None


def _get_session():
    """Lazy-load the ONNX session once; return None if unavailable."""
    global _session, _session_checked
    if _session_checked:
        return _session
    _session_checked = True
    if not _HAS_ORT:
        print("[hsemotion] onnxruntime not installed; emotions disabled.")
        return None
    if not os.path.exists(_MODEL_PATH):
        print(f"[hsemotion] model not found at {_MODEL_PATH}; emotions disabled.")
        return None
    try:
        providers = ["CPUExecutionProvider"]
        # Prefer a GPU/CoreML provider if available.
        for p in ("CoreMLExecutionProvider", "MetalPerformanceShadersExecutionProvider"):
            if p in ort.get_available_providers():
                providers.insert(0, p)
        _session = ort.InferenceSession(_MODEL_PATH, providers=providers)
    except Exception as e:  # pragma: no cover
        print(f"[hsemotion] failed to load session: {e}")
        _session = None
    return _session


def infer(crop_bgr_or_rgb: np.ndarray) -> Optional[List[float]]:
    """Classify a 224x224 face crop. Returns an 8-element probability list in
    AFFECTNET_CLASS_ORDER, or None if the model isn't available.

    Expects a uint8 HxWx3 array. HSEmotion weights expect RGB, ImageNet-normalized.
    """
    session = _get_session()
    if session is None:
        return None
    img = _preprocess(crop_bgr_or_rgb)
    input_name = session.get_inputs()[0].name
    out = session.run(None, {input_name: img})
    logits = out[0].astype(np.float64).ravel()
    return _softmax(logits).tolist()


def _preprocess(img: np.ndarray) -> np.ndarray:
    import cv2  # local import; opencv is a backend-only dep
    if img.dtype != np.uint8:
        img = np.clip(img, 0, 255).astype(np.uint8)
    if img.shape[:2] != (224, 224):
        img = cv2.resize(img, (224, 224))
    # Assume RGB input (browser sends decoded JPEG as RGB). Convert to float.
    arr = img.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    # HWC -> CHW -> NCHW
    arr = np.transpose(arr, (2, 0, 1))[None, ...]
    return arr.astype(np.float32)


def _softmax(xs: np.ndarray) -> np.ndarray:
    m = float(np.max(xs))
    e = np.exp(xs - m)
    return e / (e.sum() + 1e-9)
