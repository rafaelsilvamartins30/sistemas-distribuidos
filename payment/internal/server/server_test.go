package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"br.unir/payment/internal/server"
)

type stubPinger struct {
	err error
}

func (s stubPinger) PingContext(_ context.Context) error {
	return s.err
}

func TestHealthEndpointWhenDatabaseIsUp(t *testing.T) {
	handler := server.NewHandler(stubPinger{})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var body server.HealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body.Service != "payment" || body.Status != "ok" || body.Database != "up" {
		t.Fatalf("unexpected response body: %+v", body)
	}
}

func TestHealthEndpointWhenDatabaseIsDown(t *testing.T) {
	handler := server.NewHandler(stubPinger{err: errors.New("connection refused")})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}

	var body server.HealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body.Database != "down" {
		t.Fatalf("expected database down, got %s", body.Database)
	}
}

func TestProtectedEndpointsRequireBearerToken(t *testing.T) {
	handler := server.NewHandler(stubPinger{})
	req := httptest.NewRequest(http.MethodGet, "/payments", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 without token, got %d", rec.Code)
	}

	reqWithToken := httptest.NewRequest(http.MethodGet, "/payments", nil)
	reqWithToken.Header.Set("Authorization", "Bearer test-token")
	recWithToken := httptest.NewRecorder()

	handler.ServeHTTP(recWithToken, reqWithToken)

	if recWithToken.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 for unmapped route with token, got %d", recWithToken.Code)
	}
}
