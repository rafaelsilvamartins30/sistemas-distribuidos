# RAG query through the Web boundary

## Public request

`POST /api/v1/web/rag/query` is exposed by the Gateway and forwarded by the Web
BFF to `POST /api/v1/rag/query` on the internal AI/RAG service.

```json
{
  "question": "Quais eventos acadêmicos estão disponíveis?",
  "top_k": 5,
  "source_type": "EVENT",
  "use_live_tool": false
}
```

`question` is required (3–600 characters), `top_k` is 1–8,
`source_type` is optional (`EVENT` or `OPPORTUNITY`), and `use_live_tool` is
optional. The Web BFF preserves the caller's `Authorization` header and request
body. The Gateway accepts only `USER` and `PLATFORM_ADMIN` roles for this route.

## Authentication boundaries

AI/RAG validates the Keycloak signature using its JWKS URL, issuer and expiry,
then requires a configured user client (`unir-web` by default) and a `USER` or
`PLATFORM_ADMIN` realm role. A sync token is never accepted as a user token.

`POST /api/v1/rag/ingest` is internal only and requires the exact
`X-RAG-Sync-Token` shared secret. AI/RAG separately obtains a Keycloak
client-credentials token for the `unir-rag-sync` service account to read
Engagement. Neither ingest nor evaluation/live-tool routes are added to the
Gateway or Ingress.

## Response and degraded mode

The response follows the existing `RagQueryResponse` shape, including
`generation_status`, `fallback_used`, `answer`, and `sources`. Each source has
an `EVENT`/`OPPORTUNITY` type and the real `record_id` from Engagement. When
Gemini is not configured, retrieval still runs against Qdrant and returns the
explicit `FALLBACK_RETRIEVAL_ONLY` status and source references; no generated
answer or remote cost is claimed.
