package server_test

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"br.unir/payment/internal/server"
)

const testIssuer = "http://keycloak.test/realms/unir"

type jwtFixture struct {
	server     *httptest.Server
	verifier   *server.KeycloakTokenVerifier
	privateKey *rsa.PrivateKey
}

func newJWTFixture(t *testing.T) *jwtFixture {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate test signing key: %v", err)
	}
	keySet := map[string]any{"keys": []any{map[string]string{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": "test-key",
		"n":   base64.RawURLEncoding.EncodeToString(privateKey.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.E)).Bytes()),
	}}}
	keySetJSON, err := json.Marshal(keySet)
	if err != nil {
		t.Fatalf("marshal test JWKS: %v", err)
	}
	keyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(keySetJSON)
	}))
	t.Cleanup(keyServer.Close)
	verifier, err := server.NewKeycloakTokenVerifier(testIssuer, keyServer.URL)
	if err != nil {
		t.Fatalf("construct token verifier: %v", err)
	}
	return &jwtFixture{server: keyServer, verifier: verifier, privateKey: privateKey}
}

func (f *jwtFixture) token(t *testing.T, claims map[string]any) string {
	t.Helper()
	headerJSON, err := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": "test-key"})
	if err != nil {
		t.Fatalf("marshal test JWT header: %v", err)
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal test JWT claims: %v", err)
	}
	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedClaims := base64.RawURLEncoding.EncodeToString(claimsJSON)
	message := encodedHeader + "." + encodedClaims
	digest := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, f.privateKey, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign test JWT: %v", err)
	}
	return message + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func validClaims(sub string) map[string]any {
	return map[string]any{
		"iss": testIssuer,
		"sub": sub,
		"exp": time.Now().Add(time.Hour).Unix(),
	}
}

func TestKeycloakTokenVerifierChecksSignatureAndClaims(t *testing.T) {
	fixture := newJWTFixture(t)
	valid := fixture.token(t, validClaims("user-42"))
	if subject, err := fixture.verifier.VerifySubject(context.Background(), valid); err != nil || subject != "user-42" {
		t.Fatalf("expected signed user-42 token, got subject=%q err=%v", subject, err)
	}

	parts := strings.Split(valid, ".")
	modifiedClaims, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode claims for tamper test: %v", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(modifiedClaims, &claims); err != nil {
		t.Fatalf("unmarshal claims for tamper test: %v", err)
	}
	claims["sub"] = "other-user"
	modifiedClaims, err = json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal modified claims: %v", err)
	}
	parts[1] = base64.RawURLEncoding.EncodeToString(modifiedClaims)
	if _, err := fixture.verifier.VerifySubject(context.Background(), strings.Join(parts, ".")); !errors.Is(err, server.ErrInvalidAccessToken) {
		t.Fatalf("expected tampered token to be rejected, got %v", err)
	}

	wrongIssuer := validClaims("user-42")
	wrongIssuer["iss"] = "http://other-issuer.test/realms/unir"
	if _, err := fixture.verifier.VerifySubject(context.Background(), fixture.token(t, wrongIssuer)); !errors.Is(err, server.ErrInvalidAccessToken) {
		t.Fatalf("expected wrong issuer to be rejected, got %v", err)
	}

	expired := validClaims("user-42")
	expired["exp"] = time.Now().Add(-time.Minute).Unix()
	if _, err := fixture.verifier.VerifySubject(context.Background(), fixture.token(t, expired)); !errors.Is(err, server.ErrInvalidAccessToken) {
		t.Fatalf("expected expired token to be rejected, got %v", err)
	}

	missingExpiry := map[string]any{"iss": testIssuer, "sub": "user-42"}
	if _, err := fixture.verifier.VerifySubject(context.Background(), fixture.token(t, missingExpiry)); !errors.Is(err, server.ErrInvalidAccessToken) {
		t.Fatalf("expected token without exp to be rejected, got %v", err)
	}
}

func TestKeycloakTokenVerifierReportsUnavailableJWKS(t *testing.T) {
	fixture := newJWTFixture(t)
	fixture.server.Close()
	_, err := fixture.verifier.VerifySubject(context.Background(), fixture.token(t, validClaims("user-42")))
	if !errors.Is(err, server.ErrIdentityProviderUnavailable) {
		t.Fatalf("expected JWKS outage to be reported, got %v", err)
	}
}
