# UNIR — Serviço de IA / RAG (`ai-rag`)

Serviço responsável pela recuperação aumentada por geração (RAG) da plataforma **UNIR** (GCC129 — Sistemas Distribuídos). Auxilia estudantes a descobrir **eventos** e **oportunidades** reais da universidade a partir de perguntas em linguagem natural.

## 1. Arquitetura e Decisões Técnicas

- **Stack:** Python 3.12 + FastAPI + LangChain (`langchain-core`, `langchain-google-genai`) + Qdrant (`qdrant-client`) + FastEmbed (`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensões, ONNX local multilíngue com suporte nativo ao português) + Google Gemini (`gemini-2.5-flash`).
- **Fontes de conhecimento (v1):**
  1. Eventos ativos do Engagement (`GET /api/v1/events`).
  2. Oportunidades ativas do Engagement (`GET /api/v1/opportunities`).
  - Nenhum acesso direto ao PostgreSQL do Engagement é realizado; o cliente HTTP respeita paginação e autenticação Bearer JWT.
  - O Qdrant é tratado como índice vetorial derivado: cada registro recebe um Point ID determinístico (`UUIDv5(NAMESPACE, "EVENT:<id>")` ou `"OPPORTUNITY:<id>"`), tornando a reindexação idempotente (via `upsert`) e removendo pontos obsoletos/cancelados a cada sincronização completa.
  - Credenciais, JWTs, perfis privados de usuários e dados financeiros nunca são indexados.
- **Chain determinística vs. Agente autônomo:**
  - O fluxo principal utiliza uma chain LCEL determinística (`RunnableLambda` de recuperação + formatação de contexto delimitado `|` `ChatPromptTemplate` `|` Gemini) e uma `StructuredTool` explícita (`search_live_events`) que consulta em tempo real `GET /api/v1/events`.
  - **Justificativa:** Para o domínio de descoberta acadêmica, uma chain determinística combinada com invocação controlada da tool garante latência previsível, limite estrito de tokens enviados ao provedor remoto, ausência de loops de raciocínio e rastreabilidade direta das fontes recuperadas.
- **Proteção contra Prompt Injection:**
  - O conteúdo recuperado é delimitado em `<contexto_recuperado>` e tratado como dado cadastral não confiável; as instruções de sistema proíbem a execução de comandos contidos nos documentos e exigem citação explícita de `[ID: <uuid>]`.
- **Dois mecanismos de resiliência para o Gemini:**
  1. **Timeout por tentativa + Retry com Backoff Exponencial** (`GEMINI_TIMEOUT_SECONDS=8.0`, `GEMINI_MAX_RETRIES=2`, apenas em falhas transitórias como timeouts, erros de rede e HTTP 429/5xx).
  2. **Fallback Explícito Degradado:** Quando o Gemini está indisponível ou sem chave configurada, o serviço retorna `generation_status="FALLBACK_RETRIEVAL_ONLY"` e `fallback_used=true`, apresentando claramente os registros recuperados do Qdrant com suas fontes e IDs sem fingir uma resposta gerada pelo modelo.

## 2. Estrutura do Serviço

```text
ai-rag/
├── Dockerfile
├── Makefile
├── pyproject.toml
├── uv.lock
├── src/unir_rag/
│   ├── config.py          # Configuração via variáveis de ambiente e fórmula de custo USD
│   ├── unir_client.py     # Cliente HTTP paginado para Eventos e Oportunidades do Engagement
│   ├── ingestion.py       # Construção de documentos, embeddings locais e indexação idempotente no Qdrant
│   ├── tools.py           # LangChain StructuredTool `search_live_events`
│   ├── chain.py           # Chain LCEL LangChain + timeout, retry/backoff e fallback explícito
│   ├── evaluation.py      # Avaliação acadêmica (5 perguntas: Baseline sem RAG vs. RAG)
│   └── api.py             # Endpoints HTTP FastAPI
└── tests/
    └── test_rag_service.py
```

## 3. Endpoints HTTP

- `GET /health` e `GET /health/live` — Liveness (`200 OK`).
- `GET /health/ready` — Readiness verificando conectividade e contagem de pontos no Qdrant (`200 OK` ou `503`).
- `POST /api/v1/rag/ingest` — Sincroniza eventos e oportunidades ativos do Engagement para o Qdrant (exige `Authorization: Bearer <jwt>`).
- `POST /api/v1/rag/query` — Executa a chain RAG para uma pergunta (`question`, `top_k`, `source_type`, `use_live_tool`) e retorna resposta fundamentada, fontes citadas, latência (`retrieval_latency_ms`, `generation_latency_ms`, `total_latency_ms`), tokens e custo estimado em USD (exige `Authorization: Bearer <jwt>`).
- `GET /api/v1/rag/tools/live-events?q=&category=&free_only=&max_results=` — Invoca a tool LangChain `search_live_events` diretamente contra o Engagement (exige `Authorization: Bearer <jwt>`).
- `POST /api/v1/rag/evaluate` — Executa o benchmark acadêmico das 5 perguntas comparando `baseline` (sem recuperação) e `rag` (com recuperação no Qdrant).

## 4. Execução Isolada e Qualidade

### Rodar lint, formatação e testes automatizados

```bash
make -C ai-rag quality
```

### Subir Qdrant e `ai-rag` isoladamente via `compose.rag.yaml`

Sem alterar o `compose.yaml` principal:

```bash
GEMINI_API_KEY="sua-chave-opcional" docker compose -f compose.rag.yaml up --build -d
```

- Qdrant: `http://localhost:16333`
- AI/RAG Service: `http://localhost:18090`
