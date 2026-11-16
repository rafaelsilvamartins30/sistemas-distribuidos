package payment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	integrationExchange   = "unir.events"
	paymentConfirmedRoute = "payment.charge.confirmed.v1"
)

type paymentOutboxRecord struct {
	ID          string
	EventType   string
	AggregateID string
	PayloadJSON []byte
	CreatedAt   time.Time
}

type paymentIntegrationEnvelope struct {
	MessageID     string          `json:"messageId"`
	EventType     string          `json:"eventType"`
	AggregateType string          `json:"aggregateType"`
	AggregateID   string          `json:"aggregateId"`
	OccurredAt    time.Time       `json:"occurredAt"`
	SchemaVersion int             `json:"schemaVersion"`
	PayloadJSON   json.RawMessage `json:"payloadJson"`
}

// OutboxPublisher publishes PaymentConfirmed events and marks them only after
// RabbitMQ confirms the mandatory, persistent message. A crash after broker
// confirmation and before the database update may redeliver, by design.
type OutboxPublisher struct {
	db     *sql.DB
	url    string
	logger *slog.Logger
}

func NewOutboxPublisher(db *sql.DB, url string, logger *slog.Logger) *OutboxPublisher {
	if logger == nil {
		logger = slog.Default()
	}
	return &OutboxPublisher{db: db, url: url, logger: logger}
}

func (p *OutboxPublisher) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for ctx.Err() == nil {
		if err := p.PublishPending(ctx); err != nil && ctx.Err() == nil {
			p.logger.Warn("Payment Outbox publish attempt failed; events will be retried", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (p *OutboxPublisher) PublishPending(ctx context.Context) error {
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, event_type, aggregate_id, payload_json, created_at
		FROM payment_outbox
		WHERE event_type IN ($1, $2, $3) AND published_at IS NULL
		ORDER BY created_at ASC
		LIMIT 50
	`, paymentConfirmedEvent, RefundSucceededEventType, RefundFailedEventType)
	if err != nil {
		return fmt.Errorf("read PaymentConfirmed Outbox: %w", err)
	}
	var pending []paymentOutboxRecord
	for rows.Next() {
		var record paymentOutboxRecord
		if err := rows.Scan(&record.ID, &record.EventType, &record.AggregateID, &record.PayloadJSON,
			&record.CreatedAt); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan Payment Outbox row: %w", err)
		}
		pending = append(pending, record)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("iterate Payment Outbox: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close Payment Outbox rows: %w", err)
	}
	if len(pending) == 0 {
		return nil
	}

	connection, err := amqp.Dial(p.url)
	if err != nil {
		return fmt.Errorf("connect to RabbitMQ for Payment Outbox: %w", err)
	}
	defer func() { _ = connection.Close() }()
	channel, err := connection.Channel()
	if err != nil {
		return fmt.Errorf("open RabbitMQ channel for Payment Outbox: %w", err)
	}
	defer func() { _ = channel.Close() }()
	if err := channel.ExchangeDeclare(integrationExchange, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare integration events exchange: %w", err)
	}
	if err := channel.Confirm(false); err != nil {
		return fmt.Errorf("enable RabbitMQ publisher confirms: %w", err)
	}
	confirms := channel.NotifyPublish(make(chan amqp.Confirmation, 1))
	returns := channel.NotifyReturn(make(chan amqp.Return, 1))
	for _, record := range pending {
		routingKey, routeErr := paymentEventRoutingKey(record.EventType)
		if routeErr != nil || !json.Valid(record.PayloadJSON) {
			return fmt.Errorf("invalid Payment Outbox record %s", record.ID)
		}
		body, err := json.Marshal(paymentIntegrationEnvelope{
			MessageID: record.ID, EventType: record.EventType, AggregateType: "Charge",
			AggregateID: record.AggregateID, OccurredAt: record.CreatedAt.UTC(), SchemaVersion: 1,
			PayloadJSON: json.RawMessage(record.PayloadJSON),
		})
		if err != nil {
			return fmt.Errorf("encode PaymentConfirmed envelope: %w", err)
		}
		sequence := channel.GetNextPublishSeqNo()
		if err := channel.PublishWithContext(ctx, integrationExchange, routingKey, true, false,
			amqp.Publishing{
				ContentType: "application/json", DeliveryMode: amqp.Persistent, MessageId: record.ID,
				Timestamp: record.CreatedAt.UTC(), Body: body,
			}); err != nil {
			return fmt.Errorf("publish Payment event %s: %w", record.ID, err)
		}
		if err := waitForPublish(ctx, sequence, confirms, returns); err != nil {
			return fmt.Errorf("confirm Payment event %s: %w", record.ID, err)
		}
		if _, err := p.db.ExecContext(ctx, `
			UPDATE payment_outbox SET published_at = $2
			WHERE id = $1 AND published_at IS NULL
		`, record.ID, time.Now().UTC()); err != nil {
			return fmt.Errorf("mark Payment event %s published: %w", record.ID, err)
		}
	}
	return nil
}

func paymentEventRoutingKey(eventType string) (string, error) {
	switch eventType {
	case paymentConfirmedEvent:
		return paymentConfirmedRoute, nil
	case RefundSucceededEventType:
		return RefundSucceededRoute, nil
	case RefundFailedEventType:
		return RefundFailedRoute, nil
	default:
		return "", fmt.Errorf("unsupported Payment Outbox event type %q", eventType)
	}
}

func waitForPublish(ctx context.Context, sequence uint64, confirms <-chan amqp.Confirmation,
	returns <-chan amqp.Return) error {
	for {
		select {
		case returned, ok := <-returns:
			if !ok {
				return errors.New("RabbitMQ return notification channel closed")
			}
			return fmt.Errorf("RabbitMQ returned unroutable message %s", returned.MessageId)
		case confirmation, ok := <-confirms:
			if !ok {
				return errors.New("RabbitMQ publisher confirmation channel closed")
			}
			if confirmation.DeliveryTag != sequence {
				continue
			}
			if !confirmation.Ack {
				return errors.New("RabbitMQ negatively acknowledged the message")
			}
			select {
			case returned := <-returns:
				return fmt.Errorf("RabbitMQ returned unroutable message %s", returned.MessageId)
			default:
				return nil
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
