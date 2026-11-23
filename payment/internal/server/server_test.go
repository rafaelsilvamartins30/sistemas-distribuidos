package server_test

import (
	"context"
	"encoding/base64"
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

type stubUserStore struct {
	stubConfirmer
	charges []payment.ChargeSummary
	userID  string
	err     error
}

func (s *stubUserStore) ListChargesForUser(_ context.Context, payerUserID string) ([]payment.ChargeSummary, error) {
	s.userID = payerUserID
	return s.charges, nil
}

func (s *stubUserStore) ConfirmSimulatedPaymentForUser(_ context.Context, registrationID, payerUserID string,
	paidAt time.Time) (payment.PaymentConfirmedEvent, error) {
	s.registrationID = registrationID
	s.userID = payerUserID
	s.paidAt = paidAt
	return s.result, s.err
}

func TestUserPaymentsListAndConfirmRoutes(t *testing.T) {
	fixture := newJWTFixture(t)
	store := &stubUserStore{
		charges: []payment.ChargeSummary{{
			ChargeID:    "c-1",
			ReferenceID: "550e8400-e29b-41d4-a716-446655440002",
			PayerUserID: "user-42",
			AmountMinor: 5000,
			Currency:    "BRL",
			Status:      "PENDING",
		}},
		stubConfirmer: stubConfirmer{result: payment.PaymentConfirmedEvent{
			RegistrationID: "550e8400-e29b-41d4-a716-446655440002",
			UserID:         "user-42",
		}},
	}
	handler := server.NewHandlerWithStoreAndVerifier(stubPinger{}, store, store, fixture.verifier)

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/payments/me", nil)
	listReq.Header.Set("Authorization", "Bearer "+fixture.token(t, validClaims("user-42")))
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK || store.userID != "user-42" {
		t.Fatalf("expected 200 for user-42, got %d (user=%q)", listRec.Code, store.userID)
	}

	confirmReq := httptest.NewRequest(http.MethodPost,
		"/api/v1/payments/550e8400-e29b-41d4-a716-446655440002/confirm",
		strings.NewReader(`{"paidAt":"2000-01-01T00:00:00Z"}`))
	confirmReq.Header.Set("Authorization", "Bearer "+fixture.token(t, validClaims("user-42")))
	confirmRec := httptest.NewRecorder()
	handler.ServeHTTP(confirmRec, confirmReq)
	if confirmRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on confirm, got %d: %s", confirmRec.Code, confirmRec.Body.String())
	}
	if !store.paidAt.IsZero() {
		t.Fatalf("expected caller-supplied paidAt to be ignored, got %v", store.paidAt)
	}

	store.err = payment.ErrChargeForbidden
	forbiddenReq := httptest.NewRequest(http.MethodPost,
		"/api/v1/payments/550e8400-e29b-41d4-a716-446655440002/confirm", nil)
	forbiddenReq.Header.Set("Authorization", "Bearer "+fixture.token(t, validClaims("other-user")))
	forbiddenRec := httptest.NewRecorder()
	handler.ServeHTTP(forbiddenRec, forbiddenReq)
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for foreign charge, got %d", forbiddenRec.Code)
	}
}

func TestUserPaymentRoutesRejectForgedJwt(t *testing.T) {
	fixture := newJWTFixture(t)
	store := &stubUserStore{}
	handler := server.NewHandlerWithStoreAndVerifier(stubPinger{}, store, store, fixture.verifier)
	valid := fixture.token(t, validClaims("user-42"))
	parts := strings.Split(valid, ".")
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode test token: %v", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		t.Fatalf("unmarshal test claims: %v", err)
	}
	claims["sub"] = "victim-user"
	claimsJSON, err = json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal forged test claims: %v", err)
	}
	parts[1] = base64.RawURLEncoding.EncodeToString(claimsJSON)
	forged := strings.Join(parts, ".")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments/me", nil)
	req.Header.Set("Authorization", "Bearer "+forged)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected forged token to be rejected with 401, got %d", rec.Code)
	}
	if store.userID != "" {
		t.Fatalf("forged token reached the payment store as user %q", store.userID)
	}
}
