"""HTTP client for querying public events and opportunities from UNIR Engagement."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class EngagementClientError(RuntimeError):
    """Raised when the UNIR Engagement service rejects or fails a request."""

    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class EngagementEventRecord:
    """Public event fields exposed by Engagement GET /api/v1/events."""

    id: str
    title: str
    description: str
    organizer_type: str
    organizer_id: str
    location: str
    starts_at: str
    ends_at: str
    category: str
    capacity: int | None
    registration_deadline: str
    registration_mode: str
    price: int | None
    external_url: str | None
    attendance_enabled: bool
    attendance_mode: str | None
    status: str

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> EngagementEventRecord:
        return cls(
            id=str(payload["id"]),
            title=str(payload["title"]).strip(),
            description=str(payload["description"]).strip(),
            organizer_type=str(payload["organizerType"]).strip(),
            organizer_id=str(payload["organizerId"]).strip(),
            location=str(payload["location"]).strip(),
            starts_at=str(payload["startsAt"]),
            ends_at=str(payload["endsAt"]),
            category=str(payload["category"]).strip(),
            capacity=int(payload["capacity"]) if payload.get("capacity") is not None else None,
            registration_deadline=str(payload["registrationDeadline"]),
            registration_mode=str(payload["registrationMode"]).strip(),
            price=int(payload["price"]) if payload.get("price") is not None else None,
            external_url=(
                str(payload["externalUrl"]).strip() if payload.get("externalUrl") else None
            ),
            attendance_enabled=bool(payload.get("attendanceEnabled", False)),
            attendance_mode=(
                str(payload["attendanceMode"]).strip() if payload.get("attendanceMode") else None
            ),
            status=str(payload.get("status", "ACTIVE")).strip(),
        )


@dataclass(frozen=True)
class EngagementOpportunityRecord:
    """Public opportunity fields exposed by Engagement GET /api/v1/opportunities."""

    id: str
    title: str
    description: str
    publisher_type: str
    publisher_id: str
    category: str
    deadline: str | None
    external_url: str
    status: str

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> EngagementOpportunityRecord:
        return cls(
            id=str(payload["id"]),
            title=str(payload["title"]).strip(),
            description=str(payload["description"]).strip(),
            publisher_type=str(payload["publisherType"]).strip(),
            publisher_id=str(payload["publisherId"]).strip(),
            category=str(payload["category"]).strip(),
            deadline=str(payload["deadline"]) if payload.get("deadline") else None,
            external_url=str(payload["externalUrl"]).strip(),
            status=str(payload.get("status", "ACTIVE")).strip(),
        )


class UnirEngagementClient:
    """Paginated HTTP client for the Engagement service."""

    PAGE_SIZE = 50

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 5.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._client = http_client

    def list_all_active_events(self, bearer_token: str) -> list[EngagementEventRecord]:
        items = self._fetch_all_pages(self._resource_path("events"), bearer_token)
        return [EngagementEventRecord.from_api(item) for item in items]

    def list_all_active_opportunities(self, bearer_token: str) -> list[EngagementOpportunityRecord]:
        items = self._fetch_all_pages(self._resource_path("opportunities"), bearer_token)
        return [EngagementOpportunityRecord.from_api(item) for item in items]

    def fetch_events_page(
        self, bearer_token: str, page: int = 0, size: int = 20
    ) -> list[EngagementEventRecord]:
        payload = self._get_page(self._resource_path("events"), bearer_token, page=page, size=size)
        raw_items = payload.get("items", [])
        if not isinstance(raw_items, list):
            raise EngagementClientError("Invalid events response from Engagement", 502)
        return [EngagementEventRecord.from_api(item) for item in raw_items]

    def _resource_path(self, resource: str) -> str:
        if self._base_url.endswith("/api/v1/web") or self._base_url.endswith("/api/v1"):
            return f"/{resource}"
        return f"/api/v1/{resource}"

    def _fetch_all_pages(self, path: str, bearer_token: str) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        page = 0
        while True:
            payload = self._get_page(path, bearer_token, page=page, size=self.PAGE_SIZE)
            items = payload.get("items", [])
            if not isinstance(items, list):
                raise EngagementClientError(f"Malformed paginated response on {path}", 502)
            collected.extend(items)
            total_pages = int(payload.get("totalPages", 0))
            page += 1
            if page >= total_pages or not items:
                break
        return collected

    def _get_page(self, path: str, bearer_token: str, page: int, size: int) -> dict[str, Any]:
        token = bearer_token.strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token:
            raise EngagementClientError("A valid bearer token is required", 401)

        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        params = {"page": page, "size": min(100, max(1, size))}

        try:
            if self._client is not None:
                response = self._client.get(
                    url, headers=headers, params=params, timeout=self._timeout
                )
            else:
                with httpx.Client(timeout=self._timeout) as client:
                    response = client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            raise EngagementClientError(f"Engagement service unavailable: {exc}", 503) from exc

        if response.status_code in (401, 403):
            raise EngagementClientError(
                f"Engagement rejected token with status {response.status_code}",
                response.status_code,
            )
        if response.status_code >= 400:
            raise EngagementClientError(
                f"Engagement returned HTTP {response.status_code}",
                502,
            )

        data = response.json()
        if not isinstance(data, dict):
            raise EngagementClientError("Expected JSON object from Engagement", 502)
        return data
