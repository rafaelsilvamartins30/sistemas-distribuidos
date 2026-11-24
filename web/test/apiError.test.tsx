import assert from "node:assert/strict";
import test from "node:test";
import { extractErrorMessage, parseApiError } from "../src/utils/apiError.js";

test("parseApiError extracts RFC 7807 ProblemDetail detail and code", async () => {
  const response = new Response(
    JSON.stringify({
      title: "Unprocessable Entity",
      status: 422,
      detail: "O prazo de inscrição deve estar no futuro.",
      code: "EVENT_DEADLINE_NOT_FUTURE",
    }),
    { status: 422, headers: { "content-type": "application/problem+json" } },
  );

  const parsed = await parseApiError(response);
  assert.equal(parsed.status, 422);
  assert.equal(parsed.message, "O prazo de inscrição deve estar no futuro.");
  assert.equal(parsed.code, "EVENT_DEADLINE_NOT_FUTURE");
});

test("parseApiError joins validation arrays and field error maps", async () => {
  const fastApiResponse = new Response(
    JSON.stringify({
      detail: [{ loc: ["body", "question"], msg: "String should have at least 3 characters" }],
    }),
    { status: 422, headers: { "content-type": "application/json" } },
  );
  const parsedFastApi = await parseApiError(fastApiResponse);
  assert.equal(parsedFastApi.message, "question: String should have at least 3 characters");

  const railsErrorsResponse = new Response(JSON.stringify({ errors: { name: ["não pode ficar em branco"] } }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
  const parsedRails = await parseApiError(railsErrorsResponse);
  assert.equal(parsedRails.message, "name: não pode ficar em branco");
});

test("parseApiError ignores generic English HTTP titles and HTML bodies in favor of PT-BR fallback", async () => {
  const genericJson = new Response(JSON.stringify({ title: "Unprocessable Entity", status: 422 }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
  assert.equal((await parseApiError(genericJson)).message, "Não foi possível validar os dados informados.");

  const html503 = new Response("<html><body>503 Service Unavailable</body></html>", {
    status: 503,
    headers: { "content-type": "text/html" },
  });
  assert.equal(
    (await parseApiError(html503)).message,
    "Serviço temporariamente indisponível. Tente novamente em instantes.",
  );
});

test("extractErrorMessage returns Error message or fallback", () => {
  assert.equal(extractErrorMessage(new Error("Nome obrigatório")), "Nome obrigatório");
  assert.equal(extractErrorMessage(null, "Falha genérica."), "Falha genérica.");
});
