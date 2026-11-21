"""LangChain tools integrated with live UNIR Engagement HTTP endpoints."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from unir_rag.unir_client import EngagementEventRecord, UnirEngagementClient


class SearchLiveEventsInput(BaseModel):
    """Validated parameters for querying live UNIR events from Engagement."""

    query: str | None = Field(
        default=None,
        max_length=120,
        description="Termo opcional para filtrar título, descrição ou local do evento.",
    )
    category: str | None = Field(
        default=None,
        max_length=60,
        description="Categoria opcional (ex.: ACADEMIC, CULTURE, EXTENSION, SPORTS, RESEARCH).",
    )
    free_only: bool = Field(
        default=False,
        description="Se verdadeiro, retorna apenas eventos gratuitos (INTERNAL_FREE).",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Quantidade máxima de eventos retornados (1 a 20).",
    )


def format_live_event(event: EngagementEventRecord) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "category": event.category,
        "organizerType": event.organizer_type,
        "organizerId": event.organizer_id,
        "location": event.location,
        "startsAt": event.starts_at,
        "endsAt": event.ends_at,
        "registrationDeadline": event.registration_deadline,
        "registrationMode": event.registration_mode,
        "priceMinor": event.price,
        "referenceUrl": event.external_url or f"/eventos/{event.id}",
        "status": event.status,
    }


def build_search_live_events_tool(
    engagement_client: UnirEngagementClient,
    bearer_token: str,
) -> StructuredTool:
    """Create a bound LangChain StructuredTool that queries live events from Engagement."""

    def _search_live_events(
        query: str | None = None,
        category: str | None = None,
        free_only: bool = False,
        max_results: int = 5,
    ) -> list[dict[str, Any]]:
        events = engagement_client.list_all_active_events(bearer_token)
        normalized_query = (query or "").strip().lower()
        normalized_cat = (category or "").strip().lower()

        matched: list[dict[str, Any]] = []
        for event in events:
            if event.status != "ACTIVE":
                continue
            if free_only and event.registration_mode != "INTERNAL_FREE":
                continue
            if normalized_cat and event.category.lower() != normalized_cat:
                continue
            if normalized_query:
                haystack = (
                    f"{event.title} {event.description} {event.location} {event.category}".lower()
                )
                if normalized_query not in haystack:
                    continue
            matched.append(format_live_event(event))
            if len(matched) >= max_results:
                break
        return matched

    return StructuredTool.from_function(
        func=_search_live_events,
        name="search_live_events",
        description=(
            "Consulta em tempo real os eventos ativos da UNIR diretamente no serviço Engagement via HTTP."
        ),
        args_schema=SearchLiveEventsInput,
    )
