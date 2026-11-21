package server

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	jwksCacheTTL = 5 * time.Minute
	maxJWKSBytes = 1 << 20
)

var (
	ErrInvalidAccessToken          = errors.New("invalid access token")
	ErrIdentityProviderUnavailable = errors.New("identity provider unavailable")
)

// SubjectVerifier authenticates a bearer token and returns its trusted subject.
type SubjectVerifier interface {
	VerifySubject(ctx context.Context, token string) (string, error)
}

// KeycloakTokenVerifier validates Keycloak RS256 access tokens using the configured JWKS.
type KeycloakTokenVerifier struct {
	issuer  string
	jwksURL string
	client  *http.Client
	now     func() time.Time

	mu            sync.Mutex
	keys          map[string]*rsa.PublicKey
	keysFetchedAt time.Time
}

type jwtHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type jwtClaims struct {
	Issuer    string      `json:"iss"`
	Subject   string      `json:"sub"`
	Expires   json.Number `json:"exp"`
	NotBefore json.Number `json:"nbf"`
}

type jwksDocument struct {
	Keys []jsonWebKey `json:"keys"`
}

type jsonWebKey struct {
	KeyType  string `json:"kty"`
	Use      string `json:"use"`
	Alg      string `json:"alg"`
	KeyID    string `json:"kid"`
	Modulus  string `json:"n"`
	Exponent string `json:"e"`
}

// NewKeycloakTokenVerifier creates a verifier configured with the Keycloak issuer and JWKS URL.
func NewKeycloakTokenVerifier(issuer, jwksURL string) (*KeycloakTokenVerifier, error) {
	issuer = strings.TrimSpace(issuer)
	issuerURL, err := url.Parse(issuer)
	if err != nil || issuerURL.Scheme == "" || issuerURL.Host == "" || issuerURL.RawQuery != "" || issuerURL.Fragment != "" {
		return nil, errors.New("KEYCLOAK_ISSUER_URI must be an absolute URL without query or fragment")
	}
	if issuerURL.Scheme != "http" && issuerURL.Scheme != "https" {
		return nil, errors.New("KEYCLOAK_ISSUER_URI must use HTTP or HTTPS")
	}

	jwksURL = strings.TrimSpace(jwksURL)
	jwks, err := url.Parse(jwksURL)
	if err != nil || jwks.Scheme == "" || jwks.Host == "" || jwks.RawQuery != "" || jwks.Fragment != "" {
		return nil, errors.New("KEYCLOAK_JWK_SET_URI must be an absolute URL without query or fragment")
	}
	if jwks.Scheme != "http" && jwks.Scheme != "https" {
		return nil, errors.New("KEYCLOAK_JWK_SET_URI must use HTTP or HTTPS")
	}

	return &KeycloakTokenVerifier{
		issuer:  strings.TrimRight(issuer, "/"),
		jwksURL: jwksURL,
		client:  &http.Client{Timeout: 3 * time.Second},
		now:     time.Now,
	}, nil
}

// VerifySubject checks the signature, issuer, expiry, not-before claim, and subject.
func (v *KeycloakTokenVerifier) VerifySubject(ctx context.Context, token string) (string, error) {
	segments := strings.Split(token, ".")
	if len(segments) != 3 || segments[0] == "" || segments[1] == "" || segments[2] == "" {
		return "", ErrInvalidAccessToken
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(segments[0])
	if err != nil {
		return "", ErrInvalidAccessToken
	}
	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "RS256" || header.KeyID == "" {
		return "", ErrInvalidAccessToken
	}

	key, err := v.keyForID(ctx, header.KeyID)
	if err != nil {
		return "", err
	}
	signature, err := base64.RawURLEncoding.DecodeString(segments[2])
	if err != nil {
		return "", ErrInvalidAccessToken
	}
	digest := sha256.Sum256([]byte(segments[0] + "." + segments[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return "", ErrInvalidAccessToken
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(segments[1])
	if err != nil {
		return "", ErrInvalidAccessToken
	}
	var claims jwtClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return "", ErrInvalidAccessToken
	}
	if claims.Issuer != v.issuer || strings.TrimSpace(claims.Subject) == "" || len(claims.Subject) > 255 {
		return "", ErrInvalidAccessToken
	}

	expiresAt, err := claims.Expires.Int64()
	if err != nil || expiresAt <= v.now().Unix() {
		return "", ErrInvalidAccessToken
	}
	if claims.NotBefore != "" {
		notBefore, err := claims.NotBefore.Int64()
		if err != nil || notBefore > v.now().Unix() {
			return "", ErrInvalidAccessToken
		}
	}
	return claims.Subject, nil
}

func (v *KeycloakTokenVerifier) keyForID(ctx context.Context, keyID string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.now().Sub(v.keysFetchedAt) < jwksCacheTTL {
		if key := v.keys[keyID]; key != nil {
			return key, nil
		}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create Keycloak JWKS request: %w", ErrIdentityProviderUnavailable)
	}
	request.Header.Set("Accept", "application/json")
	response, err := v.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch Keycloak JWKS: %w", ErrIdentityProviderUnavailable)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch Keycloak JWKS returned %s: %w", response.Status, ErrIdentityProviderUnavailable)
	}

	var document jwksDocument
	if err := json.NewDecoder(io.LimitReader(response.Body, maxJWKSBytes)).Decode(&document); err != nil {
		return nil, fmt.Errorf("decode Keycloak JWKS: %w", ErrIdentityProviderUnavailable)
	}
	keys := make(map[string]*rsa.PublicKey, len(document.Keys))
	for _, jwk := range document.Keys {
		if jwk.KeyType != "RSA" || jwk.KeyID == "" || (jwk.Use != "" && jwk.Use != "sig") ||
			(jwk.Alg != "" && jwk.Alg != "RS256") {
			continue
		}
		if key := parseRSAPublicKey(jwk); key != nil {
			keys[jwk.KeyID] = key
		}
	}
	v.keys = keys
	v.keysFetchedAt = v.now()
	if key := keys[keyID]; key != nil {
		return key, nil
	}
	return nil, ErrInvalidAccessToken
}

func parseRSAPublicKey(jwk jsonWebKey) *rsa.PublicKey {
	modulusBytes, err := base64.RawURLEncoding.DecodeString(jwk.Modulus)
	if err != nil || len(modulusBytes) == 0 {
		return nil
	}
	exponentBytes, err := base64.RawURLEncoding.DecodeString(jwk.Exponent)
	if err != nil || len(exponentBytes) == 0 || len(exponentBytes) > 4 {
		return nil
	}
	var exponent uint64
	for _, value := range exponentBytes {
		exponent = exponent<<8 | uint64(value)
	}
	if exponent < 3 || exponent%2 == 0 {
		return nil
	}

	modulus := new(big.Int).SetBytes(modulusBytes)
	if modulus.BitLen() < 2048 {
		return nil
	}
	return &rsa.PublicKey{N: modulus, E: int(exponent)}
}
