package payment

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	chargeCreatedEvent = "ChargeCreated"
	pendingStatus      = "PENDING"
)

// Store persists payment events, their read projection, and outbound events.
type Store struct {
	db       *sql.DB
	provider PixProvider
	now      func() time.Time
}

func NewStore(db *sql.DB, provider PixProvider) *Store {
	return &Store{db: db, provider: provider, now: func() time.Time { return time.Now().UTC() }}
}

// Process validates and persists one broker delivery. A nil error means the
// message is safe to acknowledge, including an already processed duplicate.
func (s *Store) Process(ctx context.Context, body []byte) error {
	incoming, err := DecodeRegistrationPayment(body)
	if err != nil {
		return err
	}

	messageHash, err := hashEnvelope(incoming)
	if err != nil {
		return fmt.Errorf("hash integration message: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin charge transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO processed_messages (message_id, registration_id, message_hash, processed_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (message_id) DO NOTHING
	`, incoming.Envelope.MessageID, incoming.Request.RegistrationID, messageHash, s.now())
	if err != nil {
		return fmt.Errorf("record processed message: %w", err)
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check processed message insert: %w", err)
	}
	if inserted == 0 {
		var registrationID, existingHash string
		if err := tx.QueryRowContext(ctx, `
			SELECT registration_id, message_hash FROM processed_messages WHERE message_id = $1
		`, incoming.Envelope.MessageID).Scan(&registrationID, &existingHash); err != nil {
			return fmt.Errorf("read duplicate message: %w", err)
		}
		if !strings.EqualFold(registrationID, incoming.Request.RegistrationID) || existingHash != messageHash {
			return invalidMessage("messageId was reused with a different request", nil)
		}
		return commitDuplicate(tx)
	}

	var existingChargeID string
	err = tx.QueryRowContext(ctx, `
		SELECT charge_id FROM charge_projections
		WHERE reference_type = $1 AND reference_id = $2
		FOR UPDATE
	`, RegistrationReferenceType, incoming.Request.RegistrationID).Scan(&existingChargeID)
	if err == nil {
		var payloadJSON []byte
		if err := tx.QueryRowContext(ctx, `
			SELECT payload_json FROM payment_events
			WHERE aggregate_id = $1 AND aggregate_version = 1 AND event_type = $2
		`, existingChargeID, chargeCreatedEvent).Scan(&payloadJSON); err != nil {
			return fmt.Errorf("read existing ChargeCreated event: %w", err)
		}
		var existing ChargeCreatedEvent
		if err := json.Unmarshal(payloadJSON, &existing); err != nil {
			return fmt.Errorf("decode existing ChargeCreated event: %w", err)
		}
		if !sameRequest(existing.Request, incoming.Request) {
			return invalidMessage("registrationId was reused with different payment values", nil)
		}
		return commitDuplicate(tx)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check registration charge: %w", err)
	}

	chargeID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create charge id: %w", err)
	}
	providerCharge, err := s.provider.CreateCharge(ctx, chargeID, incoming.Request)
	if err != nil {
		return fmt.Errorf("create simulated Pix charge: %w", err)
	}
	createdAt := s.now()
	event := ChargeCreatedEvent{
		ChargeID:          chargeID,
		Request:           incoming.Request,
		Status:            pendingStatus,
		Provider:          s.provider.Name(),
		ProviderReference: providerCharge.Reference,
		PixCopyPaste:      providerCharge.PixCopyPaste,
		QRCodeURL:         providerCharge.QRCodeURL,
		CreatedAt:         createdAt,
		ExpiresAt:         incoming.Request.PaymentDeadlineAt,
	}
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("serialize ChargeCreated event: %w", err)
	}
	eventID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create payment event id: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_events (id, aggregate_id, aggregate_version, event_type, payload_json, occurred_at)
		VALUES ($1, $2, 1, $3, $4, $5)
	`, eventID, chargeID, chargeCreatedEvent, string(eventJSON), createdAt); err != nil {
		return fmt.Errorf("append ChargeCreated event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO charge_projections (
			charge_id, reference_type, reference_id, payer_user_id, amount_minor, currency,
			status, provider, provider_reference, pix_copy_paste, qr_code_url, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, event.ChargeID, RegistrationReferenceType, event.Request.RegistrationID, event.Request.UserID,
		event.Request.AmountMinor, event.Request.Currency, event.Status, event.Provider, event.ProviderReference,
		event.PixCopyPaste, event.QRCodeURL, event.CreatedAt, event.ExpiresAt); err != nil {
		return fmt.Errorf("insert charge projection: %w", err)
	}
	outboxID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create payment outbox id: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_outbox (id, event_type, aggregate_id, payload_json, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, outboxID, chargeCreatedEvent, chargeID, string(eventJSON), createdAt); err != nil {
		return fmt.Errorf("insert ChargeCreated outbox event: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit charge transaction: %w", err)
	}
	return nil
}

// RebuildProjection replays the append-only Event Store into its derived read model.
func (s *Store) RebuildProjection(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin projection rebuild: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM charge_projections`); err != nil {
		return fmt.Errorf("clear charge projection: %w", err)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT event_type, payload_json FROM payment_events
		ORDER BY aggregate_id, aggregate_version
	`)
	if err != nil {
		return fmt.Errorf("read Payment Event Store: %w", err)
	}
	type storedEvent struct {
		eventType   string
		payloadJSON []byte
	}
	var events []storedEvent
	for rows.Next() {
		var event storedEvent
		if err := rows.Scan(&event.eventType, &event.payloadJSON); err != nil {
			_ = rows.Close()
			return fmt.Errorf("read Payment event row: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("iterate Payment Event Store: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close Payment Event Store rows: %w", err)
	}
	for _, stored := range events {
		if stored.eventType != chargeCreatedEvent {
			return fmt.Errorf("cannot rebuild projection from unsupported PaymentEvent %q", stored.eventType)
		}
		var event ChargeCreatedEvent
		if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
			return fmt.Errorf("decode ChargeCreated event: %w", err)
		}
		if err := insertProjection(ctx, tx, event); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit projection rebuild: %w", err)
	}
	return nil
}

// ChargeCreatedEvent is the append-only Payment event used to rebuild the projection.
type ChargeCreatedEvent struct {
	ChargeID          string                     `json:"chargeId"`
	Request           RegistrationPaymentRequest `json:"request"`
	Status            string                     `json:"status"`
	Provider          string                     `json:"provider"`
	ProviderReference string                     `json:"providerReference,omitempty"`
	PixCopyPaste      string                     `json:"pixCopyPaste,omitempty"`
	QRCodeURL         string                     `json:"qrCodeUrl,omitempty"`
	CreatedAt         time.Time                  `json:"createdAt"`
	ExpiresAt         time.Time                  `json:"expiresAt"`
}

func insertProjection(ctx context.Context, tx *sql.Tx, event ChargeCreatedEvent) error {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO charge_projections (
			charge_id, reference_type, reference_id, payer_user_id, amount_minor, currency,
			status, provider, provider_reference, pix_copy_paste, qr_code_url, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, event.ChargeID, RegistrationReferenceType, event.Request.RegistrationID, event.Request.UserID,
		event.Request.AmountMinor, event.Request.Currency, event.Status, event.Provider, event.ProviderReference,
		event.PixCopyPaste, event.QRCodeURL, event.CreatedAt, event.ExpiresAt); err != nil {
		return fmt.Errorf("rebuild charge %s projection: %w", event.ChargeID, err)
	}
	return nil
}

func commitDuplicate(tx *sql.Tx) error {
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit idempotent message: %w", err)
	}
	return nil
}

func hashEnvelope(incoming IncomingRegistrationPayment) (string, error) {
	canonicalPayload, err := json.Marshal(incoming.Request)
	if err != nil {
		return "", err
	}
	envelope := incoming.Envelope
	envelope.PayloadJSON = canonicalPayload
	canonicalEnvelope, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(canonicalEnvelope)
	return hex.EncodeToString(hash[:]), nil
}

func sameRequest(left, right RegistrationPaymentRequest) bool {
	return strings.EqualFold(left.RegistrationID, right.RegistrationID) &&
		strings.EqualFold(left.EventID, right.EventID) && left.UserID == right.UserID &&
		left.AmountMinor == right.AmountMinor && left.Currency == right.Currency &&
		left.PaymentDeadlineAt.Equal(right.PaymentDeadlineAt) &&
		left.ReservationExpiresAt.Equal(right.ReservationExpiresAt)
}

func newUUID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}
