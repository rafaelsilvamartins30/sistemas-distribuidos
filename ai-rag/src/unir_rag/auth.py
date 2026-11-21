"""Keycloak access-token validation and service-account authentication."""

from __future__ import annotations

import time
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient


class InvalidAccessToken(Exception):
    """Raised when a token is invalid or is not a UNIR browser-user token."""


class IdentityProviderUnavailable(Exception):
    """Raised when Keycloak cannot be reached to validate or mint a token."""


class KeycloakTokenValidator:
    """Validate Keycloak-signed JWTs and ensure they belong to an allowed user client."""

    def __init__(
        self,
        issuer: str,
        jwks_url: str,
        user_client_ids: frozenset[str] = frozenset({"unir-web"}),
        jwks_client: Any | None = None,
    ) -> None:
        self._issuer = issuer.rstrip("/")
        self._user_client_ids = user_client_ids
        self._jwks_client = jwks_client or PyJWKClient(jwks_url, timeout=3, cache_keys=True)

    def verify(self, token: str) -> dict[str, Any]:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
        except jwt.PyJWKClientConnectionError as exc:
            raise IdentityProviderUnavailable("Keycloak signing keys are unavailable") from exc
        except jwt.PyJWKClientError as exc:
            raise InvalidAccessToken("Token signing key is invalid") from exc

        try:
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self._issuer,
                # Keycloak's access token uses `azp` for the OAuth client and may
                # include the built-in `account` audience. The exact `azp` check
                # below binds this token to the UNIR user client.
                options={"require": ["exp", "iss", "sub"], "verify_aud": False},
            )
        except jwt.InvalidTokenError as exc:
            raise InvalidAccessToken("Access token is invalid") from exc

        if claims.get("azp") not in self._user_client_ids:
            raise InvalidAccessToken("Access token was not issued to a user client")
        realm_access = claims.get("realm_access")
        roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
        if not {"USER", "PLATFORM_ADMIN"}.intersection(roles):
            raise InvalidAccessToken("Access token has no UNIR user role")
        return claims


class KeycloakServiceTokenProvider:
    """Mint and cache a client-credentials token for internal Engagement reads."""

    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str | None,
        http_client: httpx.Client | None = None,
        monotonic: Any = time.monotonic,
    ) -> None:
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._client = http_client or httpx.Client(timeout=5)
        self._monotonic = monotonic
        self._access_token: str | None = None
        self._expires_at = 0.0

    def get_token(self) -> str:
        if not self._client_secret:
            raise IdentityProviderUnavailable("RAG service-account credentials are not configured")
        if self._access_token and self._monotonic() < self._expires_at:
            return self._access_token

        try:
            response = self._client.post(
                self._token_url,
                data={"grant_type": "client_credentials"},
                auth=(self._client_id, self._client_secret),
            )
            response.raise_for_status()
            payload = response.json()
            access_token = payload.get("access_token")
            expires_in = int(payload.get("expires_in", 0))
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise IdentityProviderUnavailable("Could not obtain the RAG service token") from exc

        if not isinstance(access_token, str) or not access_token or expires_in <= 0:
            raise IdentityProviderUnavailable("Keycloak returned an invalid RAG service token")
        self._access_token = access_token
        self._expires_at = self._monotonic() + max(0, expires_in - 30)
        return access_token
