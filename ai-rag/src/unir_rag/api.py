"""FastAPI HTTP entrypoints for the UNIR AI/RAG service."""

from __future__ import annotations

import hmac
from dataclasses import asdict
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient

from unir_rag.auth import (
    ForbiddenAccessToken,
    IdentityProviderUnavailable,
    InvalidAccessToken,
    KeycloakServiceTokenProvider,
    KeycloakTokenValidator,
)
from unir_rag.chain import GeminiLangChainGenerator, LlmGenerator, UnirRagChain
from unir_rag.config import RagConfig
from unir_rag.evaluation import run_academic_evaluation
from unir_rag.ingestion import (
    EmbeddingProvider,
    FastEmbedLocalEmbeddings,
    KnowledgeBaseIndexer,
)
from unir_rag.tools import build_search_live_events_tool
from unir_rag.unir_client import EngagementClientError, UnirEngagementClient


class RagQueryRequest(BaseModel):
    """Request payload for POST /api/v1/rag/query."""

    question: str = Field(..., min_length=3, max_length=600)
    top_k: int = Field(default=5, ge=1, le=8)
    source_type: str | None = Field(default=None, pattern="^(EVENT|OPPORTUNITY|event|opportunity)$")
    use_live_tool: bool = Field(default=False)


def extract_bearer_token(
    authorization: str | None = Header(default=None),
) -> str:
    """Require a Bearer token; its signature and claims are checked separately."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    raise HTTPException(
        status_code=401,
        detail="A Bearer access token is required",
    )


def create_app(
    config: RagConfig | None = None,
    qdrant_client: QdrantClient | None = None,
    embeddings: EmbeddingProvider | None = None,
    llm_generator: LlmGenerator | None = None,
    engagement_client: UnirEngagementClient | None = None,
    token_validator: KeycloakTokenValidator | None = None,
    service_token_provider: KeycloakServiceTokenProvider | None = None,
) -> FastAPI:
    """Create and wire the FastAPI RAG application."""
    cfg = config or RagConfig.from_env()
    qdrant = qdrant_client or (
        QdrantClient(location=":memory:")
        if cfg.qdrant_url == ":memory:"
        else QdrantClient(url=cfg.qdrant_url)
    )
    embedder = embeddings or FastEmbedLocalEmbeddings(
        model_name=cfg.embedding_model,
        dimension=cfg.embedding_dimension,
    )
    indexer = KnowledgeBaseIndexer(
        qdrant=qdrant,
        embeddings=embedder,
        collection_name=cfg.qdrant_collection,
    )
    engagement = engagement_client or UnirEngagementClient(
        base_url=cfg.engagement_url,
        timeout_seconds=cfg.http_timeout_seconds,
    )
    llm = llm_generator or GeminiLangChainGenerator(
        api_key=cfg.gemini_api_key,
        model_name=cfg.gemini_model,
    )
    validator = token_validator or KeycloakTokenValidator(
        issuer=cfg.keycloak_issuer,
        jwks_url=cfg.keycloak_jwks_url,
        user_client_ids=cfg.user_client_ids,
    )
    sync_tokens = service_token_provider or KeycloakServiceTokenProvider(
        token_url=cfg.keycloak_token_url,
        client_id=cfg.sync_client_id,
        client_secret=cfg.sync_client_secret,
    )
    rag_chain = UnirRagChain(
        config=cfg,
        indexer=indexer,
        llm_generator=llm,
        engagement_client=engagement,
    )

    app = FastAPI(title="UNIR AI/RAG Service", version="0.1.0")

    def require_user_token(token: str = Depends(extract_bearer_token)) -> str:
        try:
            validator.verify(token)
            return token
        except IdentityProviderUnavailable as exc:
            raise HTTPException(status_code=503, detail="Identity provider unavailable") from exc
        except ForbiddenAccessToken as exc:
            raise HTTPException(status_code=403, detail="Insufficient permissions") from exc
        except InvalidAccessToken as exc:
            raise HTTPException(status_code=401, detail="Invalid access token") from exc

    def require_admin_token(token: str = Depends(extract_bearer_token)) -> str:
        try:
            claims = validator.verify(token)
        except IdentityProviderUnavailable as exc:
            raise HTTPException(status_code=503, detail="Identity provider unavailable") from exc
        except ForbiddenAccessToken as exc:
            raise HTTPException(status_code=403, detail="Insufficient permissions") from exc
        except InvalidAccessToken as exc:
            raise HTTPException(status_code=401, detail="Invalid access token") from exc
        realm_access = claims.get("realm_access") if isinstance(claims, dict) else None
        roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        if "PLATFORM_ADMIN" not in roles:
            raise HTTPException(status_code=403, detail="PLATFORM_ADMIN role is required")
        return token

    def require_sync_token(x_rag_sync_token: str | None = Header(default=None)) -> bool:
        if cfg.sync_token is None:
            raise HTTPException(status_code=503, detail="RAG ingestion is not configured")
        if not x_rag_sync_token or not hmac.compare_digest(x_rag_sync_token, cfg.sync_token):
            raise HTTPException(status_code=401, detail="Invalid RAG sync credential")
        return True

    @app.get("/health")
    @app.get("/health/live")
    def health_live() -> dict[str, str]:
        return {"service": "ai-rag", "status": "ok"}

    @app.get("/health/ready")
    def health_ready() -> dict[str, Any]:
        try:
            count = indexer.count_points()
            return {
                "service": "ai-rag",
                "status": "ok",
                "qdrantCollection": cfg.qdrant_collection,
                "indexedPoints": count,
                "embeddingModel": embedder.model_name,
                "geminiConfigured": cfg.gemini_api_key is not None,
            }
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Qdrant vector store unavailable") from exc

    @app.post("/api/v1/rag/ingest")
    def ingest_knowledge_base(
        _authorized: bool = Depends(require_sync_token),
    ) -> dict[str, Any]:
        try:
            service_token = sync_tokens.get_token()
            summary = indexer.sync_from_engagement(engagement, bearer_token=service_token)
            return asdict(summary)
        except IdentityProviderUnavailable as exc:
            raise HTTPException(status_code=503, detail="Identity provider unavailable") from exc
        except EngagementClientError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    @app.post("/api/v1/rag/query")
    def query_knowledge_base(
        request: RagQueryRequest,
        token: str = Depends(require_user_token),
    ) -> dict[str, Any]:
        try:
            response = rag_chain.query(
                question=request.question,
                top_k=request.top_k,
                source_type=request.source_type.upper() if request.source_type else None,
                use_live_tool=request.use_live_tool,
                bearer_token=token,
            )
            return asdict(response)
        except EngagementClientError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    @app.get("/api/v1/rag/tools/live-events")
    def query_live_events_tool(
        q: str | None = Query(default=None, max_length=120),
        category: str | None = Query(default=None, max_length=60),
        free_only: bool = Query(default=False),
        max_results: int = Query(default=5, ge=1, le=20),
        token: str = Depends(require_user_token),
    ) -> dict[str, Any]:
        try:
            tool = build_search_live_events_tool(engagement, bearer_token=token)
            items = tool.invoke(
                {
                    "query": q,
                    "category": category,
                    "free_only": free_only,
                    "max_results": max_results,
                }
            )
            return {"tool": tool.name, "count": len(items), "items": items}
        except EngagementClientError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    @app.post("/api/v1/rag/evaluate")
    def evaluate_rag(
        token: str = Depends(require_admin_token),
    ) -> dict[str, Any]:
        _ = token
        return run_academic_evaluation(rag_chain)

    return app
