package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
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

func hasBearerToken(authorization string) bool {
	parts := strings.Fields(authorization)
	return len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != ""
}
