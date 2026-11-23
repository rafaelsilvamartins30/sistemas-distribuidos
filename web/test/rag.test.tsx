import assert from "node:assert/strict";
import test from "node:test";
import { queryRagAssistant, RagApiError } from "../src/services/rag.js";

test("queryRagAssistant posts question and options with bearer token to Gateway", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const mockFetch: typeof globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        question: "Quais eventos gratuitos acontecem na UFLA?",
        mode: "rag",
        answer: "O evento Workshop de IA [ID: evt-1] é gratuito.",
        sources: [
          {
            source_type: "EVENT",
            record_id: "evt-1",
            title: "Workshop de IA",
            category: "WORKSHOP",
            reference_url: "/eventos/evt-1",
            score: 0.91,
          },
        ],
        live_tool_results: [],
        generation_status: "GENERATED",
        fallback_used: false,
        fallback_reason: null,
        attempts: 1,
        retrieval_latency_ms: 42.1,
        generation_latency_ms: 810.5,
        total_latency_ms: 852.6,
        model_name: "gemini-2.5-flash",
        prompt_tokens: 180,
        completion_tokens: 45,
        total_tokens: 225,
        estimated_cost_usd: 0.000054,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await queryRagAssistant(
    "jwt-demo",
    {
      question: "  Quais eventos gratuitos acontecem na UFLA?  ",
      top_k: 4,
      source_type: "EVENT",
      use_live_tool: true,
    },
    "http://localhost:18080",
    mockFetch,
  );

  assert.equal(capturedUrl, "http://localhost:18080/api/v1/web/rag/query");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(capturedInit?.headers, {
    Authorization: "Bearer jwt-demo",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    question: "Quais eventos gratuitos acontecem na UFLA?",
    top_k: 4,
    source_type: "EVENT",
    use_live_tool: true,
  });
  assert.equal(result.generation_status, "GENERATED");
  assert.equal(result.sources.length, 1);
});

test("queryRagAssistant surfaces gateway/service errors as RagApiError", async () => {
  const mockFetch: typeof globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "AI/RAG Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () => queryRagAssistant("jwt-demo", { question: "Teste" }, "http://localhost:18080", mockFetch),
    (err: unknown) => err instanceof RagApiError && err.status === 503 && err.message === "AI/RAG Service unavailable",
  );
});
