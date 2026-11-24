export interface ParsedApiError {
  status: number;
  message: string;
  code?: string;
}

const GENERIC_HTTP_TITLES = new Set([
  "bad request",
  "unauthorized",
  "forbidden",
  "not found",
  "method not allowed",
  "conflict",
  "unprocessable entity",
  "unprocessable content",
  "too many requests",
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
]);

function joinMessages(values: unknown[]): string | null {
  const parts = values
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const field =
          typeof record.field === "string"
            ? record.field.trim()
            : Array.isArray(record.loc)
              ? String(record.loc[record.loc.length - 1] ?? "").trim()
              : "";
        const text =
          typeof record.msg === "string"
            ? record.msg.trim()
            : typeof record.message === "string"
              ? record.message.trim()
              : typeof record.detail === "string"
                ? record.detail.trim()
                : "";
        if (field && text && field !== "body") return `${field}: ${text}`;
        if (text) return text;
      }
      return "";
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

function extractErrorsField(errors: unknown): string | null {
  if (Array.isArray(errors)) return joinMessages(errors);
  if (errors && typeof errors === "object") {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        parts.push(`${key}: ${value.trim()}`);
      } else if (Array.isArray(value)) {
        const joined = joinMessages(value);
        if (joined) parts.push(`${key}: ${joined}`);
      }
    }
    if (parts.length) return parts.join("; ");
  }
  return null;
}

export function extractPayloadMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed && !trimmed.startsWith("<") ? trimmed : null;
  }
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (typeof record.detail === "string" && record.detail.trim()) {
    return record.detail.trim();
  }
  if (Array.isArray(record.detail)) {
    const joined = joinMessages(record.detail);
    if (joined) return joined;
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  const fromErrors = extractErrorsField(record.errors ?? record.fieldErrors);
  if (fromErrors) return fromErrors;

  if (typeof record.error === "string" && record.error.trim()) {
    const err = record.error.trim();
    if (!GENERIC_HTTP_TITLES.has(err.toLowerCase())) return err;
  }
  if (typeof record.title === "string" && record.title.trim()) {
    const title = record.title.trim();
    if (!GENERIC_HTTP_TITLES.has(title.toLowerCase())) return title;
  }
  return null;
}

export function defaultStatusMessage(status: number, fallback?: string): string {
  switch (status) {
    case 400:
      return fallback ?? "Dados inválidos. Verifique os campos informados.";
    case 401:
      return "Sua sessão expirou. Faça login novamente.";
    case 403:
      return "Você não tem permissão para realizar esta ação.";
    case 404:
      return "Registro não encontrado.";
    case 409:
      return fallback ?? "Conflito ao salvar: o registro já existe ou mudou de estado.";
    case 422:
      return fallback ?? "Não foi possível validar os dados informados.";
    case 429:
      return "Muitas tentativas em sequência. Aguarde alguns segundos.";
    case 502:
    case 503:
    case 504:
      return "Serviço temporariamente indisponível. Tente novamente em instantes.";
    case 500:
      return "Erro interno no servidor. Tente novamente.";
    default:
      return fallback ?? `Não foi possível concluir a operação (HTTP ${status}).`;
  }
}

export async function parseApiError(response: Response, fallback?: string): Promise<ParsedApiError> {
  let code: string | undefined;
  let extracted: string | null = null;

  try {
    const raw = await response.text();
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).code === "string") {
          code = (parsed as Record<string, unknown>).code as string;
        }
        extracted = extractPayloadMessage(parsed);
      } catch {
        extracted = extractPayloadMessage(raw);
      }
    }
  } catch {
    // Ignore body read failures and fall back to status-based messaging.
  }

  return {
    status: response.status,
    message: extracted ?? defaultStatusMessage(response.status, fallback),
    ...(code ? { code } : {}),
  };
}

export function extractErrorMessage(error: unknown, fallback = "Não foi possível concluir a operação."): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}
