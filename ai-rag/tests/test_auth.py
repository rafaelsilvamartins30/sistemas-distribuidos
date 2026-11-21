"""Authentication tests for user JWT verification and internal sync credentials."""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from unir_rag.auth import (
    IdentityProviderUnavailable,
    InvalidAccessToken,
    KeycloakServiceTokenProvider,
    KeycloakTokenValidator,
)

ISSUER = "http://localhost:18080/realms/unir"


class StaticJwksClient:
    def __init__(self, key: Any) -> None:
        self.key = key

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        _ = token
        return SimpleNamespace(key=self.key)


def signed_token(private_key: Any, **claims: Any) -> str:
    now = int(time.time())
    payload = {
        "iss": ISSUER,
        "sub": "user-123",
        "azp": "unir-web",
        "iat": now,
        "exp": now + 300,
        "realm_access": {"roles": ["USER"]},
        **claims,
    }
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "test-key"})


def test_keycloak_validator_accepts_signed_user_jwt_and_rejects_invalid_claims() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    validator = KeycloakTokenValidator(
        issuer=ISSUER,
        jwks_url="http://keycloak.test/jwks",
        jwks_client=StaticJwksClient(private_key.public_key()),
    )

    accepted = validator.verify(signed_token(private_key))
    assert accepted["sub"] == "user-123"

    keycloak_default_audience = validator.verify(signed_token(private_key, aud="account"))
    assert keycloak_default_audience["azp"] == "unir-web"

    with pytest.raises(InvalidAccessToken):
        validator.verify(signed_token(other_key))
    with pytest.raises(InvalidAccessToken):
        validator.verify(signed_token(private_key, iss="http://attacker.test/realms/unir"))
    with pytest.raises(InvalidAccessToken):
        validator.verify(signed_token(private_key, exp=int(time.time()) - 1))
    with pytest.raises(InvalidAccessToken):
        validator.verify(signed_token(private_key, azp="unir-rag-sync"))
    with pytest.raises(InvalidAccessToken):
        validator.verify(signed_token(private_key, realm_access={"roles": ["GUEST"]}))


def test_keycloak_service_token_provider_uses_client_credentials_and_caches_token() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url == "http://keycloak.test/token"
        assert request.headers["authorization"].startswith("Basic ")
        assert request.content == b"grant_type=client_credentials"
        return httpx.Response(200, json={"access_token": "service-token", "expires_in": 300})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = KeycloakServiceTokenProvider(
        "http://keycloak.test/token",
        "unir-rag-sync",
        "local-secret",
        http_client=client,
        monotonic=lambda: 100,
    )

    assert provider.get_token() == "service-token"
    assert provider.get_token() == "service-token"
    assert len(requests) == 1


def test_keycloak_service_token_provider_fails_closed_without_secret() -> None:
    provider = KeycloakServiceTokenProvider("http://keycloak.test/token", "unir-rag-sync", None)

    with pytest.raises(IdentityProviderUnavailable):
        provider.get_token()
