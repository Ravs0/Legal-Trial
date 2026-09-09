// api/_lib/sse.ts — SSE frame encoder + keepalive for LexForge streams.
export type SSEEvent = { event?: string; data: unknown; id?: string; retry?: number };

export function encodeSSE(e: SSEEvent): string {
  let f = "";
  if (e.id != null) f += `id: ${e.id}\n`;
  if (e.event) f += `event: ${e.event}\n`;
  if (e.retry != null) f += `retry: ${e.retry}\n`;
  const body = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
  for (const line of body.split("\n")) f += `data: ${line}\n`;
  return f + "\n";
}

export const keepaliveFrame = ": ping\n\n";

export function sseHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...extra,
  };
}

export function sseResponse(stream: ReadableStream, extra?: HeadersInit): Response {
  return new Response(stream, { headers: sseHeaders(extra) });
}

export function startKeepalive(push: (chunk: string) => void, ms = 15000): () => void {
  const t = setInterval(() => push(keepaliveFrame), ms);
  return () => clearInterval(t);
}
