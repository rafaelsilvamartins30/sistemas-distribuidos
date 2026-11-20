"""Configuration and provider settings for the UNIR AI/RAG service."""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_EMBEDDING_DIMENSION = 384
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# Reference pricing for Gemini 2.5 Flash (USD per 1,000,000 tokens).
GEMINI_FLASH_INPUT_USD_PER_1M = 0.15
GEMINI_FLASH_OUTPUT_USD_PER_1M = 0.60


@dataclass(frozen=True)
class RagConfig:
    """Immutable runtime configuration loaded from environment variables."""

    engagement_url: str = "http://localhost:18085"
    qdrant_url: str = "http://localhost:16333"
    qdrant_collection: str = "unir_knowledge"
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    embedding_dimension: int = DEFAULT_EMBEDDING_DIMENSION
    gemini_api_key: str | None = None
    gemini_model: str = DEFAULT_GEMINI_MODEL
    gemini_timeout_seconds: float = 8.0
    gemini_max_retries: int = 2
    gemini_retry_base_delay_seconds: float = 0.25
    top_k: int = 5
    max_chars_per_doc: int = 1200
    sync_token: str | None = None
    http_timeout_seconds: float = 5.0

    @classmethod
    def from_env(cls) -> RagConfig:
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or None
        sync_token = os.getenv("RAG_SYNC_TOKEN", "").strip() or None
        return cls(
            engagement_url=os.getenv("ENGAGEMENT_URL", "http://localhost:18085").rstrip("/"),
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:16333").strip(),
            qdrant_collection=os.getenv("QDRANT_COLLECTION", "unir_knowledge").strip(),
            embedding_model=os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip(),
            embedding_dimension=int(
                os.getenv("EMBEDDING_DIMENSION", str(DEFAULT_EMBEDDING_DIMENSION))
            ),
            gemini_api_key=gemini_key,
            gemini_model=os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip(),
            gemini_timeout_seconds=float(os.getenv("GEMINI_TIMEOUT_SECONDS", "8.0")),
            gemini_max_retries=int(os.getenv("GEMINI_MAX_RETRIES", "2")),
            gemini_retry_base_delay_seconds=float(
                os.getenv("GEMINI_RETRY_BASE_DELAY_SECONDS", "0.25")
            ),
            top_k=max(1, min(8, int(os.getenv("RAG_TOP_K", "5")))),
            max_chars_per_doc=max(200, int(os.getenv("RAG_MAX_CHARS_PER_DOC", "1200"))),
            sync_token=sync_token,
            http_timeout_seconds=float(os.getenv("ENGAGEMENT_HTTP_TIMEOUT_SECONDS", "5.0")),
        )


def estimate_cost_usd(prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate estimated operation cost in USD using Gemini 2.5 Flash reference rates."""
    input_cost = (max(0, prompt_tokens) / 1_000_000.0) * GEMINI_FLASH_INPUT_USD_PER_1M
    output_cost = (max(0, completion_tokens) / 1_000_000.0) * GEMINI_FLASH_OUTPUT_USD_PER_1M
    return round(input_cost + output_cost, 8)
