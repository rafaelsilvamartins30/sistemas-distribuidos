"""Deterministic test suite for the UNIR AI/RAG service."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient

from unir_rag.api import create_app
from unir_rag.chain import (
    LlmGenerationResult,
    NonRetryableLlmError,
    TransientLlmError,
)
from unir_rag.config import RagConfig, estimate_cost_usd
from unir_rag.ingestion import DeterministicMultilingualEmbeddings
from unir_rag.unir_client import UnirEngagementClient

SAMPLE_EVENTS: list[dict[str, Any]] = [
    {
        "id": "fcbeea6b-369a-5e58-aa9a-0e5e366340f3",
        "title": "Demonstração local — Mostra estudantil de software",
        "description": "Mostra de engenharia de software e sistemas distribuídos com inscrição gratuita.",
        "organizerType": "DEPARTMENT",
        "organizerId": "af272b7f-015b-5daa-8556-13a6a1ab3e0b",
        "imageUrl": None,
        "location": "Laboratório de demonstração ICET",
        "startsAt": "2027-04-14T13:00:00Z",
        "endsAt": "2027-04-14T17:00:00Z",
        "category": "ACADEMIC",
        "capacity": 60,
        "registrationDeadline": "2027-04-12T23:59:00Z",
        "registrationMode": "INTERNAL_FREE",
        "price": None,
        "externalUrl": None,
        "attendanceEnabled": False,
        "attendanceMode": None,
        "status": "ACTIVE",
        "createdAt": "2026-11-18T12:00:00Z",
    },
    {
        "id": "e1316386-73ea-504a-8e29-f1ee2e6a9303",
        "title": "Demonstração local — Oficina de prototipação",
        "description": "Atividade prática sobre prototipação com inscrição paga via Pix.",
        "organizerType": "DEPARTMENT",
        "organizerId": "af272b7f-015b-5daa-8556-13a6a1ab3e0b",
        "imageUrl": None,
        "location": "Sala de demonstração ICET",
        "startsAt": "2027-01-25T14:00:00Z",
        "endsAt": "2027-01-25T17:00:00Z",
        "category": "ACADEMIC",
        "capacity": 40,
        "registrationDeadline": "2027-01-23T23:59:00Z",
        "registrationMode": "INTERNAL_PAID",
        "price": 2500,
        "externalUrl": None,
        "attendanceEnabled": False,
        "attendanceMode": None,
        "status": "ACTIVE",
        "createdAt": "2026-11-18T12:00:00Z",
    },
    {
        "id": "cf001b74-a49e-5031-912f-8c24d4d642ff",
        "title": "Demonstração local — Grupo de leitura e debate",
        "description": "Encontro cultural gratuito de leitura e debate na biblioteca.",
        "organizerType": "UNIVERSITY",
        "organizerId": "00000000-0000-4000-8000-000000000001",
        "imageUrl": None,
        "location": "Biblioteca de demonstração",
        "startsAt": "2027-02-10T16:00:00Z",
        "endsAt": "2027-02-10T18:00:00Z",
        "category": "CULTURE",
        "capacity": 35,
        "registrationDeadline": "2027-02-09T23:59:00Z",
        "registrationMode": "INTERNAL_FREE",
        "price": None,
        "externalUrl": None,
        "attendanceEnabled": True,
        "attendanceMode": "ORGANIZER_SCANS_PARTICIPANT",
        "status": "ACTIVE",
        "createdAt": "2026-11-18T12:00:00Z",
    },
    {
        "id": "2b3632ac-7f27-50c3-8f45-bccbe9aa9a5d",
        "title": "Demonstração local — Introdução a jogos de tabuleiro",
        "description": "Atividade esportiva e recreativa de integração com jogos de tabuleiro.",
        "organizerType": "ACADEMIC_ENTITY",
        "organizerId": "7c28d2cd-af5d-53fa-a4b9-6596b0ddd568",
        "imageUrl": None,
        "location": "Sala multiuso de demonstração",
        "startsAt": "2027-02-24T18:00:00Z",
        "endsAt": "2027-02-24T20:00:00Z",
        "category": "COMMUNITY",
        "capacity": 24,
        "registrationDeadline": "2027-02-23T23:59:00Z",
        "registrationMode": "INTERNAL_FREE",
        "price": None,
        "externalUrl": None,
        "attendanceEnabled": False,
        "attendanceMode": None,
        "status": "ACTIVE",
        "createdAt": "2026-11-18T12:00:00Z",
    },
]

SAMPLE_OPPORTUNITIES: list[dict[str, Any]] = [
    {
        "id": "2c8d3eb2-4b02-520e-942c-7e5ab4b0a208",
        "title": "Demonstração local — Bolsa de iniciação científica em dados",
        "description": "Pesquisa aplicada em ciência de dados e aprendizado de máquina.",
        "publisherType": "DEPARTMENT",
        "publisherId": "af272b7f-015b-5daa-8556-13a6a1ab3e0b",
        "category": "RESEARCH",
        "deadline": "2027-03-01T23:59:00Z",
        "externalUrl": "https://example.org/unir-demo/oportunidades/ic-dados",
        "imageUrl": None,
        "createdAt": "2026-11-18T12:00:00Z",
        "status": "ACTIVE",
    },
    {
        "id": "10000000-0000-4000-8000-000000000009",
        "title": "Estágio em Engenharia de Software & Sistemas Distribuídos",
        "description": "Desenvolvimento de microsserviços e APIs REST.",
        "publisherType": "ACADEMIC_ENTITY",
        "publisherId": "7c28d2cd-af5d-53fa-a4b9-6596b0ddd568",
        "category": "INTERNSHIP",
        "deadline": "2027-06-30T23:59:00Z",
        "externalUrl": "https://example.org/unir-demo/oportunidades/estagio-software",
        "imageUrl": None,
        "createdAt": "2026-11-18T12:00:00Z",
        "status": "ACTIVE",
    },
]


class DeterministicFakeGeminiGenerator:
    """Fake LLM generator that synthesizes grounded answers from the provided context."""

    def __init__(
        self,
        fail_transient_times: int = 0,
        always_fail_transient: bool = False,
        fail_non_retryable: bool = False,
    ) -> None:
        self.fail_transient_times = fail_transient_times
        self.always_fail_transient = always_fail_transient
        self.fail_non_retryable = fail_non_retryable
        self.calls = 0

    @property
    def model_name(self) -> str:
        return "gemini-2.5-flash"

    def generate(
        self, system_prompt: str, user_prompt: str, timeout_seconds: float
    ) -> LlmGenerationResult:
        _ = (system_prompt, timeout_seconds)
        self.calls += 1
        if self.fail_non_retryable:
            raise NonRetryableLlmError("GEMINI_API_KEY is invalid or missing")
        if self.always_fail_transient or self.calls <= self.fail_transient_times:
            raise TransientLlmError(f"Simulated transient Gemini timeout on attempt #{self.calls}")

        if "<contexto_recuperado>" not in user_prompt:
            text = (
                "Sem acesso ao contexto recuperado da base da UNIR, não posso informar "
                "identificadores, datas ou locais específicos de eventos e oportunidades."
            )
        else:
            context = user_prompt.split("<contexto_recuperado>", 1)[1].split(
                "</contexto_recuperado>", 1
            )[0]
            lines = [
                line.strip()
                for line in context.splitlines()
                if line.strip() and not line.strip().startswith("--- Fonte")
            ]
            summary = " | ".join(lines[:10])
            text = f"Com base nos registros oficiais da UNIR: {summary}"

        return LlmGenerationResult(
            text=text,
            prompt_tokens=160,
            completion_tokens=60,
            total_tokens=220,
            model_name=self.model_name,
        )


def build_mock_engagement_client(
    events: list[dict[str, Any]] | None = None,
    opportunities: list[dict[str, Any]] | None = None,
) -> UnirEngagementClient:
    ev_list = SAMPLE_EVENTS if events is None else events
    opp_list = SAMPLE_OPPORTUNITIES if opportunities is None else opportunities

    def handler(request: httpx.Request) -> httpx.Response:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return httpx.Response(401, json={"detail": "Missing bearer token"})
        if request.url.path == "/api/v1/events":
            return httpx.Response(
                200,
                json={
                    "items": ev_list,
                    "page": 0,
                    "size": 50,
                    "totalElements": len(ev_list),
                    "totalPages": 1,
                },
            )
        if request.url.path == "/api/v1/opportunities":
            return httpx.Response(
                200,
                json={
                    "items": opp_list,
                    "page": 0,
                    "size": 50,
                    "totalElements": len(opp_list),
                    "totalPages": 1,
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport, base_url="http://engagement.test")
    return UnirEngagementClient(base_url="http://engagement.test", http_client=http_client)


def build_test_client(
    llm: DeterministicFakeGeminiGenerator | None = None,
    events: list[dict[str, Any]] | None = None,
    opportunities: list[dict[str, Any]] | None = None,
) -> tuple[TestClient, DeterministicFakeGeminiGenerator]:
    fake_llm = llm or DeterministicFakeGeminiGenerator()
    cfg = RagConfig(
        engagement_url="http://engagement.test",
        qdrant_url=":memory:",
        qdrant_collection="unir_test_knowledge",
        gemini_api_key="test-only-key",
        gemini_timeout_seconds=2.0,
        gemini_max_retries=2,
        gemini_retry_base_delay_seconds=0.01,
    )
    app = create_app(
        config=cfg,
        qdrant_client=QdrantClient(location=":memory:"),
        embeddings=DeterministicMultilingualEmbeddings(),
        llm_generator=fake_llm,
        engagement_client=build_mock_engagement_client(events, opportunities),
    )
    return TestClient(app), fake_llm


def test_health_and_authentication_protection() -> None:
    client, _ = build_test_client()

    live = client.get("/health/live")
    assert live.status_code == 200
    assert live.json() == {"service": "ai-rag", "status": "ok"}

    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["indexedPoints"] == 0

    assert client.post("/api/v1/rag/ingest").status_code == 401
    assert client.post("/api/v1/rag/query", json={"question": "Quais eventos?"}).status_code == 401
    assert client.get("/api/v1/rag/tools/live-events").status_code == 401
    assert client.post("/api/v1/rag/evaluate").status_code == 401


def test_idempotent_ingestion_and_stale_cancelled_removal() -> None:
    events = list(SAMPLE_EVENTS)
    cfg = RagConfig(
        engagement_url="http://engagement.test",
        qdrant_url=":memory:",
        qdrant_collection="unir_idempotency_test",
        gemini_api_key="test-key",
        gemini_retry_base_delay_seconds=0.01,
    )
    qdrant = QdrantClient(location=":memory:")
    embeddings = DeterministicMultilingualEmbeddings()

    app1 = create_app(
        config=cfg,
        qdrant_client=qdrant,
        embeddings=embeddings,
        llm_generator=DeterministicFakeGeminiGenerator(),
        engagement_client=build_mock_engagement_client(events, SAMPLE_OPPORTUNITIES),
    )
    client1 = TestClient(app1)
    headers = {"Authorization": "Bearer valid.jwt.token"}

    first = client1.post("/api/v1/rag/ingest", headers=headers)
    assert first.status_code == 200
    assert first.json()["events_indexed"] == 4
    assert first.json()["opportunities_indexed"] == 2
    assert first.json()["collection_point_count"] == 6

    second = client1.post("/api/v1/rag/ingest", headers=headers)
    assert second.status_code == 200
    assert second.json()["collection_point_count"] == 6
    assert second.json()["stale_points_removed"] == 0

    updated_events = list(SAMPLE_EVENTS[:-1])
    app2 = create_app(
        config=cfg,
        qdrant_client=qdrant,
        embeddings=embeddings,
        llm_generator=DeterministicFakeGeminiGenerator(),
        engagement_client=build_mock_engagement_client(updated_events, SAMPLE_OPPORTUNITIES),
    )
    client2 = TestClient(app2)
    third = client2.post("/api/v1/rag/ingest", headers=headers)
    assert third.status_code == 200
    assert third.json()["events_indexed"] == 3
    assert third.json()["stale_points_removed"] == 1
    assert third.json()["collection_point_count"] == 5


def test_rag_query_and_langchain_live_events_tool() -> None:
    client, fake_llm = build_test_client()
    headers = {"Authorization": "Bearer valid.jwt.token"}

    client.post("/api/v1/rag/ingest", headers=headers)

    query_resp = client.post(
        "/api/v1/rag/query",
        headers=headers,
        json={
            "question": "Quais eventos gratuitos de software estão disponíveis?",
            "top_k": 3,
            "use_live_tool": True,
        },
    )
    assert query_resp.status_code == 200
    body = query_resp.json()
    assert body["generation_status"] == "GENERATED"
    assert body["fallback_used"] is False
    assert len(body["sources"]) == 3
    assert len(body["live_tool_results"]) >= 1
    assert all(item["registrationMode"] == "INTERNAL_FREE" for item in body["live_tool_results"])
    assert body["estimated_cost_usd"] == estimate_cost_usd(160, 60)
    assert fake_llm.calls == 1

    tool_resp = client.get(
        "/api/v1/rag/tools/live-events?q=software&free_only=true",
        headers=headers,
    )
    assert tool_resp.status_code == 200
    tool_body = tool_resp.json()
    assert tool_body["tool"] == "search_live_events"
    assert tool_body["count"] == 1
    assert tool_body["items"][0]["id"] == "fcbeea6b-369a-5e58-aa9a-0e5e366340f3"


def test_gemini_retry_with_backoff_recovers_from_transient_failures() -> None:
    flaky_llm = DeterministicFakeGeminiGenerator(fail_transient_times=2)
    client, _ = build_test_client(llm=flaky_llm)
    headers = {"Authorization": "Bearer valid.jwt.token"}

    client.post("/api/v1/rag/ingest", headers=headers)
    resp = client.post(
        "/api/v1/rag/query",
        headers=headers,
        json={"question": "Qual o valor da oficina de prototipação?"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["generation_status"] == "GENERATED"
    assert data["fallback_used"] is False
    assert data["attempts"] == 3
    assert flaky_llm.calls == 3


def test_gemini_unavailability_triggers_explicit_fallback_with_retrieved_sources() -> None:
    down_llm = DeterministicFakeGeminiGenerator(always_fail_transient=True)
    client, _ = build_test_client(llm=down_llm)
    headers = {"Authorization": "Bearer valid.jwt.token"}

    client.post("/api/v1/rag/ingest", headers=headers)
    resp = client.post(
        "/api/v1/rag/query",
        headers=headers,
        json={"question": "Existem bolsas de iniciação científica em dados?"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["generation_status"] == "FALLBACK_RETRIEVAL_ONLY"
    assert data["fallback_used"] is True
    assert data["attempts"] == 3
    assert "AVISO DE FALLBACK" in data["answer"]
    assert len(data["sources"]) > 0
    assert data["estimated_cost_usd"] == 0.0


def test_academic_evaluation_compares_five_questions_baseline_vs_rag() -> None:
    client, _ = build_test_client()
    headers = {"Authorization": "Bearer valid.jwt.token"}

    client.post("/api/v1/rag/ingest", headers=headers)
    eval_resp = client.post("/api/v1/rag/evaluate", headers=headers)
    assert eval_resp.status_code == 200
    report = eval_resp.json()
    assert report["questionCount"] == 5
    assert len(report["comparisons"]) == 5

    for comp in report["comparisons"]:
        assert comp["baseline"]["mode"] == "baseline"
        assert comp["baseline"]["retrieved_sources"] == []
        assert comp["rag"]["mode"] == "rag"
        assert len(comp["rag"]["retrieved_sources"]) > 0
        assert comp["rag"]["cited_source_ids_count"] >= 1
