# AI / RAG (`ai-rag`)

Serviço de **Recuperação Aumentada por Geração (RAG)** que indexa eventos e oportunidades do `Engagement` e responde a perguntas em linguagem natural com fontes clicáveis e rastreáveis (consumido pelo botão flutuante **Assistente UNIR** no cliente `web`).

- **Stack:** Python 3.12 + FastAPI + LangChain (`langchain-core`, `langchain-google-genai`) + **Qdrant** (`qdrant:6333`) + **FastEmbed** (`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensões, ONNX local) + **Google Gemini (`gemini-3.5-flash`)**.
- **Acesso:** interno no Kubernetes (`ClusterIP` `ai-rag:8090`, sem rota direta no Ingress). Apenas `POST /api/v1/web/rag/query` é publicado pelo `Gateway → Web BFF`.

---

## Como funciona e singularidades

1. **Base vetorial derivada e idempotente (Qdrant):**
   - Indexa apenas eventos e oportunidades ativos lidos via HTTP do `Engagement` usando client credentials (`unir-rag-sync`), nunca acessando o banco PostgreSQL diretamente e nunca indexando credenciais, JWTs ou dados financeiros.
   - Cada documento usa Point ID determinístico (`UUIDv5`), permitindo reindexação idempotente (`upsert`) e remoção de registros cancelados/expirados.
2. **Chain LCEL determinística + Live Tool:**
   - Combina recuperação vetorial no Qdrant com a `StructuredTool` opcional `search_live_events` (consulta em tempo real ao `Engagement` com o JWT do usuário), delimitando o contexto em `<contexto_recuperado>` para proteção contra *prompt injection* e exigindo citação explícita `[ID: <uuid>]`.
3. **Resiliência e Fallback Explícito Degradado:**
   - **Timeout + Retry:** `GEMINI_TIMEOUT_SECONDS=20.0`, `GEMINI_MAX_RETRIES=2` com backoff exponencial apenas em falhas transitórias (timeout, rede, 429/5xx).
   - **Normalização Gemini 3.x:** extrai apenas os blocos de texto limpos (`extract_response_text`) sem expor blocos internos de raciocínio/assinatura.
   - **Fallback explícito:** sem `GEMINI_API_KEY` ou com provedor indisponível, retorna `generation_status="FALLBACK_RETRIEVAL_ONLY"` (`fallback_used=true`) listando os registros reais do Qdrant sem simular resposta gerada por LLM.
4. **Telemetria em toda resposta:** devolve latência de busca, latência do LLM, contagem de tokens e estimativa de custo em USD.

---

## Endpoints e contratos

- `GET /health`, `/health/live`, `/health/ready` (verifica Qdrant, contagem de pontos e `geminiConfigured`)
- `POST /api/v1/rag/query` — consulta RAG (JWT de usuário assinado pelo Keycloak, `azp` em `unir-web`, role `USER` ou `PLATFORM_ADMIN`)
- `POST /api/v1/rag/ingest` — sincronização interna protegida por `X-RAG-Sync-Token` (não exposta no Gateway)
- `GET /api/v1/rag/tools/live-events` e `POST /api/v1/rag/evaluate` — rotas internas de tool e avaliação acadêmica (não expostas no Gateway)
- **Contrato detalhado:** [RAG Query v1](../docs/contracts/rag-query-v1.md)

---

## Qualidade

```sh
make ai-rag
# ou dentro de ai-rag/:
make quality   # uv sync, ruff check, ruff format --check e pytest
```
