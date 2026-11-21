package payment

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestOutboxPublishFailureLeavesConfirmationUnpublished(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	createdAt := time.Date(2026, 11, 16, 15, 4, 0, 0, time.UTC)
	payload, _ := json.Marshal(PaymentConfirmedEvent{
		ChargeID: "550e8400-e29b-41d4-a716-446655440010", RegistrationID: "550e8400-e29b-41d4-a716-446655440002",
		EventID: "550e8400-e29b-41d4-a716-446655440003", UserID: "keycloak-subject", AmountMinor: 2500,
		Currency: "BRL", PaidAt: createdAt,
	})
	mock.ExpectQuery("SELECT id, event_type, aggregate_id, payload_json, created_at").
		WithArgs(paymentConfirmedEvent, RefundSucceededEventType, RefundFailedEventType).
		WillReturnRows(sqlmock.NewRows([]string{"id", "event_type", "aggregate_id", "payload_json", "created_at"}).
			AddRow("550e8400-e29b-41d4-a716-446655440012", paymentConfirmedEvent,
				"550e8400-e29b-41d4-a716-446655440010", payload, createdAt))

	publisher := NewOutboxPublisher(db, "://invalid-amqp-url", nil)
	if err := publisher.PublishPending(context.Background()); err == nil {
		t.Fatal("expected RabbitMQ connection failure")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestPaymentOutboxUsesStableRoutingKeysForRefundResults(t *testing.T) {
	tests := []struct {
		eventType string
		want      string
	}{
		{eventType: paymentConfirmedEvent, want: paymentConfirmedRoute},
		{eventType: RefundSucceededEventType, want: RefundSucceededRoute},
		{eventType: RefundFailedEventType, want: RefundFailedRoute},
	}
	for _, test := range tests {
		t.Run(test.eventType, func(t *testing.T) {
			got, err := paymentEventRoutingKey(test.eventType)
			if err != nil || got != test.want {
				t.Fatalf("route %s: got %q, err %v, want %q", test.eventType, got, err, test.want)
			}
		})
	}
}
