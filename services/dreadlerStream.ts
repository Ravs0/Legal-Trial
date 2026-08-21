/**
 * NDJSON frame parser for the Dreadler streaming turn protocol.
 *
 * Wire: newline-delimited JSON frames
 *   {"t":"start"}                 — request accepted, critic running
 *   {"t":"d","v":"<text>"}        — character-response delta
 *   {"t":"f",...fullPayload}      — final frame, same shape as the non-streaming response
 *   {"t":"e","error":"..."}       — failure after headers were sent
 *
 * Pure functions only so the streaming path is unit-testable without a server.
 */

export type DreadlerStreamFrame =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | { type: 'final'; payload: Record<string, unknown> }
  | { type: 'error'; error: string };

/** True when the response is the NDJSON stream (vs a buffered JSON fallback). */
export function isDreadlerStreamResponse(res: Response): boolean {
  return (res.headers.get('content-type') || '').includes('application/x-ndjson');
}

/**
 * Parse one NDJSON line. Returns null for blank lines or unparseable junk —
 * partial reads at chunk boundaries are handled by the caller's buffering,
 * and a malformed frame must never kill an in-flight stream.
 */
export function parseDreadlerStreamLine(line: string): DreadlerStreamFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const frame = obj as Record<string, unknown>;
  const tag = frame.t;

  if (tag === 'start') return { type: 'start' };
  if (tag === 'd' && typeof frame.v === 'string' && frame.v.length > 0) {
    return { type: 'delta', text: frame.v };
  }
  if (tag === 'e' && typeof frame.error === 'string' && frame.error) {
    return { type: 'error', error: frame.error };
  }
  if (tag === 'f') {
    // Wire shape: {"t":"f", ...fullPayload} — payload fields flattened into
    // the frame. Strip the tag; payload contents are validated downstream
    // (applyTurnResult requires state_data, so an empty frame fails safely).
    const { t: _tag, ...payload } = frame;
    return { type: 'final', payload };
  }
  return null;
}

/**
 * Incremental NDJSON reader: feed raw decoded chunks (which may split lines),
 * get back complete frames. Mirrors the SSE-buffering pattern in api/chat.js.
 */
export function createDreadlerStreamBuffer() {
  let buffer = '';
  const frames: DreadlerStreamFrame[] = [];

  return {
    /** Push a raw decoded chunk; returns frames completed by this chunk. */
    push(chunk: string): DreadlerStreamFrame[] {
      buffer += chunk;
      // A single runaway line without any newline — keep only the tail.
      if (buffer.length > 512 * 1024 && !buffer.includes('\n')) {
        buffer = buffer.slice(-64 * 1024);
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parseDreadlerStreamLine(line);
        if (parsed) frames.push(parsed);
      }
      return frames.splice(0, frames.length);
    },
    /** Flush any trailing frame that arrived without a final newline. */
    flush(): DreadlerStreamFrame[] {
      const rest = buffer;
      buffer = '';
      const parsed = parseDreadlerStreamLine(rest);
      return parsed ? [parsed] : [];
    },
  };
}
