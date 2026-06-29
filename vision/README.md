# Vision — Real Biometrics Pipeline

Adds real rPPG (remote photoplethysmography) + HSEmotion emotion classification to the Legal-Trial app. Replaces the simulated biosignal data with actual pulse and expression readings extracted from the user's webcam feed.

**Architecture:** The pipeline is adaptive — on laptop, POS + HSEmotion run in the browser via ONNX Web. On phone, frames are streamed to a persistent Python backend that runs the models.

**Integration:** The hook `useRealBiometrics()` returns the same `{bpm, emotions, pupilMm, coherence, cameraOn}` shape as the simulated `useBiometrics()` in `DreadlerArenaScreen.tsx`. The screen swaps sources with a one-line conditional: `const bio = camera.cameraOn ? realBio : simulatedBio`. When the camera is off, the theater animation continues.

## Two-host reality

| Workload | Needs | Runs on |
|----------|-------|---------|
| DeepSeek LLM | Stateless HTTP | Vercel (`api/call.js`) |
| rPPG + HSEmotion | Persistent process + model | Your laptop (dev) or a VPS/container |

The phone path (`useStreamedBiometrics`) points at the Python backend via `WS_URL`. In dev, use your laptop's LAN IP so the phone can reach it.

---

## Files

```
vision/
  shared/
    types.ts              ← BiometricReading, EmotionSet, FaceBox, etc.
    emotion-keys.ts       ← 8 emotion keys matching the screen's EMOTION_KEYS
    pos.ts                ← POS algorithm (TS) — chrominance, SVD, bandpass, BPM
    roi.ts                ← ROI extraction from video element
  laptop/
    useInBrowserBiometrics.ts  ← hook: POS in rAF loop + HSEmotion on ONNX Web
    hsemotion.session.ts       ← lazy ONNX session, WebGL EP, graceful degrade
  mobile/
    useStreamedBiometrics.ts   ← hook: downsamples frames → WS → Python backend
  useRealBiometrics.ts         ← dispatcher: picks path by isMobile, unified shape
  backend/
    server.py                  ← FastAPI WebSocket endpoint (port 8787)
    pos.py                     ← POS algorithm (Python, mirrors pos.ts)
    hsemotion.py               ← HSEmotion inference via ONNX Runtime
    requirements.txt           ← Python deps
    test_pos.py                ← synthetic-pulse test (4 tests)
  models/
    .gitkeep                   ← drop hsemotion_effnet_b0_affectnet.onnx here
  README.md
```

---

## Setup

### 1. Install browser-side deps (already done)
```bash
npm install onnxruntime-web
```
This adds ~27 MB of WASM (.wasm files) for the WebGL + SIMD runtime. Vite tree-shakes most of it; the gzipped payload is ~6 MB.

### 2. Fetch HSEmotion weights (optional — POS-only works without it)
```bash
# From the HSEmotion model zoo:
# https://github.com/av-savchenko/face-emotion-recognition
# Place the .onnx file in vision/models/
# curl -Lo vision/models/hsemotion_effnet_b0_affectnet.onnx <url>
```
POS (heart rate) works fully with zero downloads. Emotions require the ONNX file.

### 3. Run the Python backend (only needed for phone path)
```bash
cd vision/backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8787
```

For the phone to reach it, use your laptop's LAN IP:
```bash
ipconfig getifaddr en0                   # macOS
hostname -I | awk '{print $1}'            # Linux
```

Then set the WebSocket URL before the phone opens the app:
```ts
// In browser console or a config surface:
window.__BIO_WS_URL__ = 'ws://192.168.1.5:8787';
```

On laptop (dev), the default `ws://localhost:8787` works.

---

## How it works

### POS (Plane-Orthogonal-to-Skin) — Wang et al. 2017

1. Forehead+cheek ROI is spatially averaged per frame → one RGB triplet.
2. Chrominance signals constructed: `X = 3R − 2G`, `Y = 1.5R + G − 1.5B`.
3. Over a sliding window (5s), variance-normalized chrominances are projected onto the POS pulse axis (eigenvector of the chrominance covariance restricted to the cardiac band).
4. The projected signal is windowed (Hamming), FFT'd, and the dominant frequency in [0.7, 3.5] Hz is extracted with **parabolic interpolation** for sub-bin precision (~1 BPM resolution).
5. SNR of the peak vs. in-band non-peak bins determines confidence; below 6 dB → BPM is null.

### HSEmotion (EfficientNet-B0 / AffectNet8)

A pretrained EfficientNet-B0 (Savchenko 2021) classifies a 224×224 centered crop into 8 categories: Neutral, Happy, Sad, Surprise, Fear, Disgust, Anger, Contempt. Runs at ~0.6 Hz on the laptop (WebGL) or server (CPU/GPU).

---

## Tests

```bash
# Python POS (synthetic pulse)
cd vision/backend && python3 test_pos.py

# TypeScript POS (synthetic pulse)
npx tsx vision/shared/pos.test.ts
```

Both implement the same algorithm and produce equivalent results:
- 72 BPM recovered within ±1 BPM
- 90 BPM recovered within ±1 BPM (parabolic interpolation resolves the half-bin ambiguity)
- Flat noise → `bpm: null` (SNR below 6 dB)
- Short window (<2× fps) → `bpm: null`

---

## Notes

- **The simulator still runs.** When the camera is off, `useBiometrics()` provides the theater animation (fake BPM/emotion driven by coherence and pressure level).
- **onnxruntime-web** adds ~27 MB WASM to the build. If you only use the mobile path and never run emotions in-browser, you can change `hsemotion.session.ts` to skip loading it and rely entirely on the Python backend for emotions.
- **The 6 dB SNR threshold** was calibrated against the synthetic test. Real lighting may need adjustment — you can tune `MIN_SNR_DB` in both `pos.ts` and `pos.py` at runtime.
