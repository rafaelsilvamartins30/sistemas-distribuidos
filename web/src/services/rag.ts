export type RagSourceTypeFilter = "EVENT" | "OPPORTUNITY";

export interface RagSourceReference {
  source_type: string;
  record_id: string;
  title: string;
  category: string;
  reference_url: string;
  score: number;
  deadline?: string | null;
  registration_mode?: string | null;
}

export interface RagLiveToolResult {
  id: string;
  title: string;
  category: string;
  registrationMode?: string;
  location?: string;
  registrationDeadline?: string;
}

export interface RagQueryRequest {
  question: string;
  top_k?: number;
  source_type?: RagSourceTypeFilter | null;
  use_live_tool?: boolean;
}

export interface RagQueryResponse {
  question: string;
  mode: string;
  answer: string;
  sources: RagSourceReference[];
  live_tool_results: RagLiveToolResult[];
  generation_status: "GENERATED" | "FALLBACK_RETRIEVAL_ONLY" | string;
  fallback_used: boolean;
  fallback_reason: string | null;
  attempts: number;
  retrieval_latency_ms: number;
  generation_latency_ms: number;
  total_latency_ms: number;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export class RagApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Assistente RAG respondeu com status ${status}.`);
    this.name = "RagApiError";
  }
}

function resolveGatewayUrl(baseUrl?: string): string {
  return (baseUrl ?? import.meta.env.VITE_GATEWAY_URL ?? "").replace(/\/+$/, "");
}

export async function queryRagAssistant(
  token: string,
  payload: RagQueryRequest,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<RagQueryResponse> {
  const body: Record<string, unknown> = {
    question: payload.question.trim(),
    top_k: payload.top_k ?? 5,
    use_live_tool: Boolean(payload.use_live_tool),
  };
  if (payload.source_type) {
    body.source_type = payload.source_type;
  }

  const response = await fetchImpl(`${resolveGatewayUrl(baseUrl)}/api/v1/web/rag/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message: string | undefined;
    try {
      const err = (await response.json()) as { message?: string; detail?: string; error?: string };
      message = err.message ?? err.detail ?? err.error;
    } catch {
      // Ignore non-JSON error payloads
    }
    throw new RagApiError(response.status, message);
  }

  return (await response.json()) as RagQueryResponse;
}
