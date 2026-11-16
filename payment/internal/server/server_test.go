package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"br.unir/payment/internal/payment"
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

func TestSimulatedConfirmationRouteIsAbsentWithoutLocalWiring(t *testing.T) {
	handler := server.NewHandler(stubPinger{})
	req := httptest.NewRequest(http.MethodPost,
		"/local/simulated-payments/550e8400-e29b-41d4-a716-446655440002/confirm", nil)
	req.Header.Set("Authorization", "Bearer local-test")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected disabled local route to return 404, got %d", rec.Code)
	}
}

func TestSimulatedConfirmationRoutePassesRegistrationAndEffectivePaidAt(t *testing.T) {
	paidAt := time.Date(2026, 11, 16, 15, 4, 0, 0, time.UTC)
	confirmer := &stubConfirmer{result: payment.PaymentConfirmedEvent{
		RegistrationID: "550e8400-e29b-41d4-a716-446655440002", PaidAt: paidAt,
	}}
	handler := server.NewHandlerWithSimulation(stubPinger{}, confirmer)
	req := httptest.NewRequest(http.MethodPost,
		"/local/simulated-payments/550e8400-e29b-41d4-a716-446655440002/confirm",
		strings.NewReader(`{"paidAt":"2026-11-16T15:04:00Z"}`))
	req.Header.Set("Authorization", "Bearer local-test")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if confirmer.registrationID != "550e8400-e29b-41d4-a716-446655440002" || !confirmer.paidAt.Equal(paidAt) {
		t.Fatalf("unexpected confirmation input: registration=%q paidAt=%v", confirmer.registrationID,
			confirmer.paidAt)
	}
}

type stubConfirmer struct {
	result         payment.PaymentConfirmedEvent
	registrationID string
	paidAt         time.Time
}

func (s *stubConfirmer) ConfirmSimulatedPayment(_ context.Context, registrationID string,
	paidAt time.Time) (payment.PaymentConfirmedEvent, error) {
	s.registrationID = registrationID
	s.paidAt = paidAt
	return s.result, nil
}
