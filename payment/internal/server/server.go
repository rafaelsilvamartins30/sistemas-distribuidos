package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"br.unir/payment/internal/payment"
)

// DatabasePinger abstracts connectivity verification against the Payment database.
type DatabasePinger interface {
	PingContext(ctx context.Context) error
}

// HealthResponse represents the health payload of the Payment service.
type HealthResponse struct {
	Service  string `json:"service"`
	Status   string `json:"status"`
	Database string `json:"database"`
}

// NewHandler creates the HTTP handler for the Payment service.
func NewHandler(db DatabasePinger) http.Handler {
	return NewHandlerWithSimulation(db, nil)
}

// NewHandlerWithSimulation adds the simulated confirmation route only when
// the caller explicitly supplies a confirmer. Production starts without one.
func NewHandlerWithSimulation(db DatabasePinger, confirmer SimulatedPaymentConfirmer) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		dbStatus := "up"
		if db == nil || db.PingContext(ctx) != nil {
			dbStatus = "down"
		}

		w.Header().Set("Content-Type", "application/json")
		if dbStatus == "down" {
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			w.WriteHeader(http.StatusOK)
		}
		_ = json.NewEncoder(w).Encode(HealthResponse{
			Service:  "payment",
			Status:   "ok",
			Database: dbStatus,
		})
	})
	if confirmer != nil {
		mux.HandleFunc("POST /local/simulated-payments/{registrationId}/confirm", func(w http.ResponseWriter,
			r *http.Request) {
			var input struct {
				PaidAt time.Time `json:"paidAt"`
			}
			if r.Body != nil && r.ContentLength != 0 {
				decoder := json.NewDecoder(io.LimitReader(r.Body, 4096))
				decoder.DisallowUnknownFields()
				if err := decoder.Decode(&input); err != nil {
					writeError(w, http.StatusBadRequest, "Invalid confirmation request")
					return
				}
				if err := decoder.Decode(new(any)); err != io.EOF {
					writeError(w, http.StatusBadRequest, "Invalid confirmation request")
					return
				}
			}
			confirmed, err := confirmer.ConfirmSimulatedPayment(r.Context(), r.PathValue("registrationId"), input.PaidAt)
			if err != nil {
				switch {
				case errors.Is(err, payment.ErrInvalidReference), errors.Is(err, payment.ErrInvalidPaidAt):
					writeError(w, http.StatusBadRequest, "Invalid confirmation request")
				case errors.Is(err, payment.ErrChargeNotFound):
					writeError(w, http.StatusNotFound, "Charge not found")
				case errors.Is(err, payment.ErrChargeNotPending):
					writeError(w, http.StatusConflict, "Charge is not pending")
				case errors.Is(err, payment.ErrNotSimulated):
					writeError(w, http.StatusForbidden, "Only simulated charges can be confirmed here")
				default:
					writeError(w, http.StatusInternalServerError, "Could not confirm simulated payment")
				}
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(confirmed)
		})
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/health" {
			mux.ServeHTTP(w, r)
			return
		}
		if !hasBearerToken(r.Header.Get("Authorization")) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"A bearer token is required"}`))
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// SimulatedPaymentConfirmer is provided only by local/test application wiring.
type SimulatedPaymentConfirmer interface {
	ConfirmSimulatedPayment(context.Context, string, time.Time) (payment.PaymentConfirmedEvent, error)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func hasBearerToken(authorization string) bool {
	parts := strings.Fields(authorization)
	return len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != ""
}
