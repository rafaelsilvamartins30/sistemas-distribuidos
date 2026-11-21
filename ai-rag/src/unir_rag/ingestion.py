"""Ingestion, local Portuguese embeddings, and idempotent Qdrant indexing."""

from __future__ import annotations

import hashlib
import math
import re
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from unir_rag.config import DEFAULT_EMBEDDING_DIMENSION, DEFAULT_EMBEDDING_MODEL
from unir_rag.unir_client import (
    EngagementEventRecord,
    EngagementOpportunityRecord,
    UnirEngagementClient,
)

RAG_POINT_NAMESPACE = uuid.UUID("a34884c3-13c1-4430-b970-7098c9a87082")


class EmbeddingProvider(Protocol):
    """Protocol for local text embedding providers."""

    @property
    def dimension(self) -> int: ...

    @property
    def model_name(self) -> str: ...

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class FastEmbedLocalEmbeddings:
    """Local multilingual ONNX embeddings using FastEmbed (supports Portuguese)."""

    def __init__(
        self,
        model_name: str = DEFAULT_EMBEDDING_MODEL,
        dimension: int = DEFAULT_EMBEDDING_DIMENSION,
    ) -> None:
        from fastembed import TextEmbedding

        self._model_name = model_name
        self._dimension = dimension
        self._model = TextEmbedding(model_name=model_name)

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self._model_name

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return [[float(x) for x in vec] for vec in self._model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        vectors = self.embed_documents([text])
        return vectors[0]


class DeterministicMultilingualEmbeddings:
    """Fast deterministic n-gram feature hashing embeddings for offline tests."""

    _TOKEN_RE = re.compile(r"[a-z0-9à-ú]+", re.IGNORECASE)

    def __init__(self, dimension: int = DEFAULT_EMBEDDING_DIMENSION) -> None:
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return "deterministic-multilingual-ngram-v1"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        vec = [0.0] * self._dimension
        normalized = text.lower()
        tokens = self._TOKEN_RE.findall(normalized)
        features: list[str] = list(tokens)
        for token in tokens:
            if len(token) >= 4:
                features.append(token[:4])
                for idx in range(len(token) - 2):
                    features.append(token[idx : idx + 3])
        if not features:
            features = ["empty"]

        for feat in features:
            digest = hashlib.sha256(feat.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "big") % self._dimension
            sign = 1.0 if (digest[4] & 1) == 0 else -1.0
            vec[bucket] += sign

        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


def point_id_for(source_type: str, record_id: str) -> str:
    """Return a deterministic UUIDv5 Qdrant point ID so re-indexing is idempotent."""
    return str(uuid.uuid5(RAG_POINT_NAMESPACE, f"{source_type.upper()}:{record_id}"))


def format_price_brl(price_minor: int | None, registration_mode: str) -> str:
    if registration_mode == "INTERNAL_FREE":
        return "Gratuito (0,00 BRL)"
    if price_minor is None:
        return "Pago em link externo (valor no canal externo)"
    reais = price_minor / 100.0
    return f"R$ {reais:.2f} ({price_minor} centavos)"


def build_event_document(event: EngagementEventRecord) -> Document:
    """Transform an active Engagement event into a LangChain Document with safe metadata."""
    mode_desc = {
        "INTERNAL_FREE": "Gratuito com inscrição interna pela UNIR",
        "INTERNAL_PAID": "Pago internamente pela UNIR via Pix",
        "EXTERNAL_PAID": "Pago com inscrição em plataforma externa",
    }.get(event.registration_mode, event.registration_mode)
    price_desc = format_price_brl(event.price, event.registration_mode)
    capacity_desc = (
        f"{event.capacity} vagas" if event.capacity is not None else "Sem limite informado"
    )
    reference_url = event.external_url or f"/eventos/{event.id}"

    text = (
        f"[EVENTO UNIR] Título: {event.title}\n"
        f"ID: {event.id}\n"
        f"Categoria: {event.category}\n"
        f"Organizador: {event.organizer_type} (ID: {event.organizer_id})\n"
        f"Modalidade de inscrição: {mode_desc} ({event.registration_mode})\n"
        f"Valor: {price_desc}\n"
        f"Local: {event.location}\n"
        f"Início: {event.starts_at} | Término: {event.ends_at}\n"
        f"Prazo de inscrição: {event.registration_deadline}\n"
        f"Capacidade: {capacity_desc}\n"
        f"Referência: {reference_url}\n"
        f"Descrição: {event.description}"
    )

    metadata: dict[str, Any] = {
        "source_type": "EVENT",
        "record_id": event.id,
        "title": event.title,
        "category": event.category,
        "organizer_or_publisher_type": event.organizer_type,
        "organizer_or_publisher_id": event.organizer_id,
        "registration_mode": event.registration_mode,
        "price_minor": event.price,
        "location": event.location,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "deadline": event.registration_deadline,
        "reference_url": reference_url,
        "status": event.status,
    }
    return Document(page_content=text, metadata=metadata)


def build_opportunity_document(opportunity: EngagementOpportunityRecord) -> Document:
    """Transform an active Engagement opportunity into a LangChain Document with safe metadata."""
    deadline_desc = opportunity.deadline or "Sem prazo fixo informado"
    text = (
        f"[OPORTUNIDADE UNIR] Título: {opportunity.title}\n"
        f"ID: {opportunity.id}\n"
        f"Categoria: {opportunity.category}\n"
        f"Publicador: {opportunity.publisher_type} (ID: {opportunity.publisher_id})\n"
        f"Prazo de inscrição: {deadline_desc}\n"
        f"Link externo oficial: {opportunity.external_url}\n"
        f"Referência: /oportunidades/{opportunity.id}\n"
        f"Descrição: {opportunity.description}"
    )

    metadata: dict[str, Any] = {
        "source_type": "OPPORTUNITY",
        "record_id": opportunity.id,
        "title": opportunity.title,
        "category": opportunity.category,
        "organizer_or_publisher_type": opportunity.publisher_type,
        "organizer_or_publisher_id": opportunity.publisher_id,
        "registration_mode": "EXTERNAL_LINK",
        "price_minor": None,
        "location": None,
        "starts_at": None,
        "ends_at": None,
        "deadline": opportunity.deadline,
        "reference_url": opportunity.external_url,
        "status": opportunity.status,
    }
    return Document(page_content=text, metadata=metadata)


@dataclass(frozen=True)
class IngestionSummary:
    """Summary returned after synchronizing UNIR events and opportunities into Qdrant."""

    collection: str
    events_indexed: int
    opportunities_indexed: int
    total_indexed: int
    stale_points_removed: int
    collection_point_count: int


class KnowledgeBaseIndexer:
    """Manages Qdrant collection setup, idempotent indexing, and similarity retrieval."""

    def __init__(
        self,
        qdrant: QdrantClient,
        embeddings: EmbeddingProvider,
        collection_name: str = "unir_knowledge",
    ) -> None:
        self._qdrant = qdrant
        self._embeddings = embeddings
        self._collection = collection_name

    @property
    def collection_name(self) -> str:
        return self._collection

    @property
    def embeddings(self) -> EmbeddingProvider:
        return self._embeddings

    def ensure_collection(self) -> None:
        existing = {c.name for c in self._qdrant.get_collections().collections}
        if self._collection not in existing:
            self._qdrant.create_collection(
                collection_name=self._collection,
                vectors_config=qmodels.VectorParams(
                    size=self._embeddings.dimension,
                    distance=qmodels.Distance.COSINE,
                ),
            )

    def sync_from_engagement(
        self, engagement_client: UnirEngagementClient, bearer_token: str
    ) -> IngestionSummary:
        events = engagement_client.list_all_active_events(bearer_token)
        opportunities = engagement_client.list_all_active_opportunities(bearer_token)
        return self.index_records(events=events, opportunities=opportunities, full_sync=True)

    def index_records(
        self,
        events: list[EngagementEventRecord],
        opportunities: list[EngagementOpportunityRecord],
        full_sync: bool = True,
    ) -> IngestionSummary:
        self.ensure_collection()

        active_docs: list[tuple[str, Document]] = []
        inactive_point_ids: set[str] = set()

        for event in events:
            pid = point_id_for("EVENT", event.id)
            if event.status == "ACTIVE":
                active_docs.append((pid, build_event_document(event)))
            else:
                inactive_point_ids.add(pid)

        for opportunity in opportunities:
            pid = point_id_for("OPPORTUNITY", opportunity.id)
            if opportunity.status == "ACTIVE":
                active_docs.append((pid, build_opportunity_document(opportunity)))
            else:
                inactive_point_ids.add(pid)

        active_point_ids = {pid for pid, _ in active_docs}

        if full_sync:
            existing_ids = self._list_all_point_ids()
            stale_ids = (existing_ids - active_point_ids) | (inactive_point_ids & existing_ids)
        else:
            existing_ids = self._list_all_point_ids()
            stale_ids = inactive_point_ids & existing_ids

        if stale_ids:
            self._qdrant.delete(
                collection_name=self._collection,
                points_selector=qmodels.PointIdsList(points=list(stale_ids)),
                wait=True,
            )

        if active_docs:
            texts = [doc.page_content for _, doc in active_docs]
            vectors = self._embeddings.embed_documents(texts)
            points = [
                qmodels.PointStruct(
                    id=pid,
                    vector=vector,
                    payload={**doc.metadata, "text": doc.page_content},
                )
                for (pid, doc), vector in zip(active_docs, vectors, strict=True)
            ]
            self._qdrant.upsert(collection_name=self._collection, points=points, wait=True)

        events_count = sum(1 for _, doc in active_docs if doc.metadata["source_type"] == "EVENT")
        opportunities_count = sum(
            1 for _, doc in active_docs if doc.metadata["source_type"] == "OPPORTUNITY"
        )
        total_in_collection = int(self._qdrant.count(collection_name=self._collection).count)

        return IngestionSummary(
            collection=self._collection,
            events_indexed=events_count,
            opportunities_indexed=opportunities_count,
            total_indexed=len(active_docs),
            stale_points_removed=len(stale_ids),
            collection_point_count=total_in_collection,
        )

    def search(
        self,
        query: str,
        top_k: int = 5,
        source_type: str | None = None,
    ) -> list[tuple[Document, float]]:
        self.ensure_collection()
        query_vector = self._embeddings.embed_query(query)
        query_filter = None
        if source_type:
            query_filter = qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="source_type",
                        match=qmodels.MatchValue(value=source_type.upper()),
                    )
                ]
            )

        response = self._qdrant.query_points(
            collection_name=self._collection,
            query=query_vector,
            query_filter=query_filter,
            limit=max(1, min(10, top_k)),
            with_payload=True,
        )

        results: list[tuple[Document, float]] = []
        for point in response.points:
            payload = dict(point.payload or {})
            text = str(payload.pop("text", ""))
            results.append((Document(page_content=text, metadata=payload), float(point.score)))
        return results

    def count_points(self) -> int:
        self.ensure_collection()
        return int(self._qdrant.count(collection_name=self._collection).count)

    def _list_all_point_ids(self) -> set[str]:
        ids: set[str] = set()
        offset = None
        while True:
            records, next_offset = self._qdrant.scroll(
                collection_name=self._collection,
                limit=250,
                offset=offset,
                with_payload=False,
                with_vectors=False,
            )
            for rec in records:
                ids.add(str(rec.id))
            if next_offset is None:
                break
            offset = next_offset
        return ids
