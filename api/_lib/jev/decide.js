// POST adapter for the LexForge JEV endpoint.
//
// The API key is deliberately read by client.js from the server environment.
// Request headers and body fields are never used as a key source, so a
// browser can use this endpoint without sending a secret to the server.
import { queryJev, JEV_MODEL } from "./client.js";
import { buildDrillQuestions, normalizeQuestions } from "./questions.js";

function asBody(req) {
  const body = req?.body;
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function badRequest(reason) {
  const error = new Error(reason);
  error.code = "chain-bad-request";
  return error;
}

/**
 * Execute one JEV request. Supplying `questions` preserves the generic
 * playground contract; omitting it builds the canonical ten-question drill
 * contract from `transcript` (or `state`).
 */
export async function decide(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("request body must be an object");
  }
  if (input.model != null && input.model !== JEV_MODEL) {
    throw badRequest(`model must be ${JEV_MODEL}`);
  }

  let state = input.state;
  let questions = input.questions;
  if (!state || typeof state !== "string" || !questions || typeof questions !== "object" || Array.isArray(questions)) {
    const transcript = input.transcript ?? input.state;
    if (typeof transcript !== "string" || transcript.trim().length < 10) {
      throw badRequest("state or transcript (at least 10 characters) required");
    }
    const drill = buildDrillQuestions(transcript, input.needle ?? {});
    state = drill.state;
    questions = drill.questions;
  }
  try { questions = normalizeQuestions(questions); }
  catch (error) { throw badRequest(error.message); }
  state = state.slice(0, 8000);

  // Do not forward input.apiKey or Authorization. queryJev resolves the
  // server-side TYPESAFE_API_KEY itself; opts.fetchImpl is test-only.
  return queryJev({
    state,
    questions,
    model: JEV_MODEL,
    fetchImpl: opts.fetchImpl,
  });
}

export default async function handler(req, res) {
  if (req?.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const result = await decide(asBody(req));
    if (!result.ok) return res.status(503).json(result);
    return res.status(200).json(result);
  } catch (error) {
    if (error?.code === "chain-bad-request") {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    return res.status(503).json({ error: "chain-degraded", code: "chain-degraded" });
  }
}
