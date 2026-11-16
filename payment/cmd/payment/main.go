package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"br.unir/payment/internal/payment"
	"br.unir/payment/internal/server"
	_ "github.com/lib/pq"
)

func main() {
	if err := run(); err != nil {
		slog.Error("Payment service stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.Default()
	dbURL := envOr("DB_URL", "postgres://localhost/unir_payment?sslmode=disable")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("open Payment database: %w", err)
	}
	defer func() { _ = db.Close() }()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	startupCtx, startupCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer startupCancel()
	if err := db.PingContext(startupCtx); err != nil {
		return fmt.Errorf("connect to Payment database: %w", err)
	}
	if err := payment.Migrate(startupCtx, db); err != nil {
		return fmt.Errorf("migrate Payment database: %w", err)
	}

	processor := payment.NewStore(db, payment.SimulatedPixProvider{})
	consumer := payment.NewConsumer(rabbitURL(), processor, logger)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go consumer.Run(ctx)

	port := envOr("PORT", "8080")
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.NewHandler(db),
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("Payment HTTP server listening", "port", port)
		serverErrors <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shut down Payment HTTP server: %w", err)
		}
		return nil
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve Payment HTTP: %w", err)
	}
}

func rabbitURL() string {
	port := envOr("RABBITMQ_PORT", "5672")
	u := &url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(envOr("RABBITMQ_USERNAME", "guest"), envOr("RABBITMQ_PASSWORD", "guest")),
		Host:   net.JoinHostPort(envOr("RABBITMQ_HOST", "localhost"), port),
		Path:   envOr("RABBITMQ_VHOST", "/"),
	}
	return u.String()
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
