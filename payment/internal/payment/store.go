package payment

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
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
	chargeCreatedEvent    = "ChargeCreated"
	paymentExpiredEvent   = "PaymentExpired"
	paymentConfirmedEvent = "PaymentConfirmed"
	pendingStatus         = "PENDING"
	expiredStatus         = "EXPIRED"
	paidStatus            = "PAID"
	cancelledStatus       = "CANCELLED"
	refundPendingStatus   = "REFUND_PENDING"
	refundFailedStatus    = "REFUND_FAILED"
	refundedStatus        = "REFUNDED"
)

var (
	ErrChargeNotFound        = errors.New("charge not found")
	ErrChargeNotPending      = errors.New("charge is not pending")
	ErrNotSimulated          = errors.New("charge is not managed by the simulated provider")
	ErrInvalidPaidAt         = errors.New("paidAt must not be in the future")
	ErrInvalidReference      = errors.New("registrationId must be a UUID")
	ErrInvalidRefundResponse = errors.New("provider returned an invalid refund response")
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
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_registration_gates (registration_id, cancelled)
		VALUES ($1, FALSE) ON CONFLICT (registration_id) DO NOTHING
	`, incoming.Request.RegistrationID); err != nil {
		return fmt.Errorf("create Payment registration gate: %w", err)
	}
	var registrationCancelled bool
	if err := tx.QueryRowContext(ctx, `
		SELECT cancelled FROM payment_registration_gates WHERE registration_id = $1 FOR UPDATE
	`, incoming.Request.RegistrationID).Scan(&registrationCancelled); err != nil {
		return fmt.Errorf("lock Payment registration gate: %w", err)
	}
	if registrationCancelled {
		var eventID, userID string
		if err := tx.QueryRowContext(ctx, `
			SELECT event_id, user_id FROM cancelled_registrations WHERE registration_id = $1
		`, incoming.Request.RegistrationID).Scan(&eventID, &userID); err != nil {
			return fmt.Errorf("read cancelled Payment registration: %w", err)
		}
		if !strings.EqualFold(eventID, incoming.Request.EventID) || userID != incoming.Request.UserID {
			return invalidMessage("cancelled registration does not match the payment request", nil)
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
		var eventType string
		var payloadJSON []byte
		if err := tx.QueryRowContext(ctx, `
			SELECT event_type, payload_json FROM payment_events
			WHERE aggregate_id = $1 AND aggregate_version = 1
		`, existingChargeID).Scan(&eventType, &payloadJSON); err != nil {
			return fmt.Errorf("read existing payment request event: %w", err)
		}
		existingRequest, err := requestFromInitialEvent(eventType, payloadJSON)
		if err != nil {
			return err
		}
		if !sameRequest(existingRequest, incoming.Request) {
			return invalidMessage("registrationId was reused with different payment values", nil)
		}
		return commitDuplicate(tx)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check registration charge: %w", err)
	}

	createdAt := s.now()
	chargeID := stableChargeID(incoming.Request.RegistrationID)
	if !createdAt.Before(incoming.Request.PaymentDeadlineAt) {
		return s.persistExpiredRequest(ctx, tx, incoming.Request, chargeID, createdAt)
	}
	providerCharge, err := s.provider.CreateCharge(ctx, incoming.Request.RegistrationID, incoming.Request)
	if err != nil {
		return fmt.Errorf("create Pix charge: %w", err)
	}
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

// ProcessRegistrationCancelledByEvent stores cancellation intent before touching
// a charge, so the message remains effective when it arrives before the charge.
func (s *Store) ProcessRegistrationCancelledByEvent(ctx context.Context, body []byte) error {
	incoming, err := DecodeRegistrationCancelledByEvent(body)
	if err != nil {
		return err
	}
	messageHash, err := hashRegistrationCancellation(incoming)
	if err != nil {
		return fmt.Errorf("hash RegistrationCancelledByEvent: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin registration cancellation transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_registration_gates (registration_id, cancelled)
		VALUES ($1, TRUE) ON CONFLICT (registration_id) DO NOTHING
	`, incoming.Payload.RegistrationID); err != nil {
		return fmt.Errorf("create cancelled Payment registration gate: %w", err)
	}
	var cancelled bool
	if err := tx.QueryRowContext(ctx, `
		SELECT cancelled FROM payment_registration_gates WHERE registration_id = $1 FOR UPDATE
	`, incoming.Payload.RegistrationID).Scan(&cancelled); err != nil {
		return fmt.Errorf("lock cancelled Payment registration gate: %w", err)
	}
	if !cancelled {
		if _, err := tx.ExecContext(ctx, `
			UPDATE payment_registration_gates SET cancelled = TRUE WHERE registration_id = $1
		`, incoming.Payload.RegistrationID); err != nil {
			return fmt.Errorf("mark Payment registration gate cancelled: %w", err)
		}
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO cancelled_registrations
			(registration_id, event_id, user_id, cancellation_message_id, message_hash, cancelled_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (registration_id) DO NOTHING
	`, incoming.Payload.RegistrationID, incoming.Payload.EventID, incoming.Payload.UserID,
		incoming.Envelope.MessageID, messageHash, incoming.Payload.CancelledAt)
	if err != nil {
		return fmt.Errorf("persist cancelled registration: %w", err)
	}
	var eventID, userID, cancellationMessageID, existingHash string
	var cancelledAt time.Time
	if err := tx.QueryRowContext(ctx, `
		SELECT event_id, user_id, cancellation_message_id, message_hash, cancelled_at
		FROM cancelled_registrations WHERE registration_id = $1 FOR UPDATE
	`, incoming.Payload.RegistrationID).Scan(&eventID, &userID, &cancellationMessageID, &existingHash, &cancelledAt); err != nil {
		return fmt.Errorf("read cancelled registration: %w", err)
	}
	if !strings.EqualFold(eventID, incoming.Payload.EventID) || userID != incoming.Payload.UserID {
		return invalidCancellationMessage("registration cancellation conflicts with stored identity", nil)
	}
	if strings.EqualFold(cancellationMessageID, incoming.Envelope.MessageID) && existingHash != messageHash {
		return invalidCancellationMessage("messageId was reused with different content", nil)
	}

	var chargeID, payerUserID, status, provider string
	err = tx.QueryRowContext(ctx, `
		SELECT charge_id, payer_user_id, status, provider FROM charge_projections
		WHERE reference_type = $1 AND reference_id = $2 FOR UPDATE
	`, RegistrationReferenceType, incoming.Payload.RegistrationID).Scan(&chargeID, &payerUserID, &status, &provider)
	if errors.Is(err, sql.ErrNoRows) {
		return commitDuplicate(tx)
	}
	if err != nil {
		return fmt.Errorf("load charge for registration cancellation: %w", err)
	}
	if payerUserID != incoming.Payload.UserID {
		return invalidCancellationMessage("userId does not match the payer", nil)
	}
	if status == pendingStatus {
		event := ChargeCancelledEvent{
			ChargeID: chargeID, RegistrationID: incoming.Payload.RegistrationID, EventID: incoming.Payload.EventID,
			Status: cancelledStatus, CancellationMessageID: cancellationMessageID, CancelledAt: cancelledAt,
		}
		if err := appendPaymentEvent(ctx, tx, chargeID, chargeCancelledEvent, event, cancelledAt); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE charge_projections SET status = $2 WHERE charge_id = $1 AND status = $3
		`, chargeID, cancelledStatus, pendingStatus); err != nil {
			return fmt.Errorf("cancel pending charge: %w", err)
		}
		return commitDuplicate(tx)
	}
	if status != paidStatus && status != refundPendingStatus && status != refundFailedStatus {
		return commitDuplicate(tx)
	}
	var paymentMessageID string
	if err := tx.QueryRowContext(ctx, `
		SELECT id FROM payment_outbox
		WHERE aggregate_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1
	`, chargeID, paymentConfirmedEvent).Scan(&paymentMessageID); err != nil {
		return fmt.Errorf("find captured payment message for cancellation: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit registration cancellation: %w", err)
	}
	return s.processRefundRequest(ctx, eventCancellationRefundRequest(incoming, chargeID, paymentMessageID))
}

func eventCancellationRefundRequest(incoming IncomingRegistrationCancellation, chargeID, paymentMessageID string) IncomingRefundRequest {
	request := RefundRequestedPayload{
		ChargeID: chargeID, RegistrationID: incoming.Payload.RegistrationID,
		PaymentMessageID: paymentMessageID, Reason: "EVENT_CANCELLED",
	}
	payloadJSON, _ := json.Marshal(request)
	return IncomingRefundRequest{
		Envelope: IntegrationEnvelope{
			MessageID: incoming.Envelope.MessageID, EventType: RefundRequestedEventType, AggregateType: RefundAggregateType,
			AggregateID: chargeID, OccurredAt: incoming.Payload.CancelledAt, SchemaVersion: SupportedSchemaVersion,
			PayloadJSON: payloadJSON,
		},
		Request: request,
	}
}

func appendPaymentEvent(ctx context.Context, tx *sql.Tx, aggregateID, eventType string, event any,
	occurredAt time.Time) error {
	version, err := nextAggregateVersion(ctx, tx, aggregateID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("serialize %s event: %w", eventType, err)
	}
	eventID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create %s event id: %w", eventType, err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_events (id, aggregate_id, aggregate_version, event_type, payload_json, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, eventID, aggregateID, version, eventType, string(payload), occurredAt); err != nil {
		return fmt.Errorf("append %s event: %w", eventType, err)
	}
	return nil
}

func (s *Store) persistExpiredRequest(ctx context.Context, tx *sql.Tx, request RegistrationPaymentRequest,
	chargeID string, expiredAt time.Time) error {
	event := PaymentExpiredEvent{
		ChargeID:   chargeID,
		Request:    request,
		Status:     expiredStatus,
		Provider:   "NONE",
		OccurredAt: expiredAt,
	}
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("serialize PaymentExpired event: %w", err)
	}
	eventID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create PaymentExpired event id: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_events (id, aggregate_id, aggregate_version, event_type, payload_json, occurred_at)
		VALUES ($1, $2, 1, $3, $4, $5)
	`, eventID, chargeID, paymentExpiredEvent, string(eventJSON), expiredAt); err != nil {
		return fmt.Errorf("append PaymentExpired event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO charge_projections (
			charge_id, reference_type, reference_id, payer_user_id, amount_minor, currency,
			status, provider, provider_reference, pix_copy_paste, qr_code_url, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10)
	`, chargeID, RegistrationReferenceType, request.RegistrationID, request.UserID, request.AmountMinor,
		request.Currency, expiredStatus, event.Provider, expiredAt, request.PaymentDeadlineAt); err != nil {
		return fmt.Errorf("persist expired payment projection: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit expired payment request: %w", err)
	}
	return nil
}

// ConfirmSimulatedPayment explicitly settles a pending simulated charge. It is
// only exposed through the local/test HTTP handler; the transaction keeps the
// Event Store, projection and integration Outbox consistent.
func (s *Store) ConfirmSimulatedPayment(ctx context.Context, registrationID string,
	requestedPaidAt time.Time) (PaymentConfirmedEvent, error) {
	if !uuidPattern.MatchString(registrationID) {
		return PaymentConfirmedEvent{}, ErrInvalidReference
	}
	registrationID = strings.ToLower(registrationID)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("begin simulated payment confirmation: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var event PaymentConfirmedEvent
	var status, provider string
	err = tx.QueryRowContext(ctx, `
		SELECT charge_id, reference_id, payer_user_id, amount_minor, currency, status, provider
		FROM charge_projections
		WHERE reference_type = $1 AND reference_id = $2
		FOR UPDATE
	`, RegistrationReferenceType, registrationID).Scan(&event.ChargeID, &event.RegistrationID,
		&event.UserID, &event.AmountMinor, &event.Currency, &status, &provider)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentConfirmedEvent{}, ErrChargeNotFound
	}
	if err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("load charge for confirmation: %w", err)
	}
	var cancellation *IncomingRegistrationCancellation
	var cancellationMessageID, cancellationEventID, cancellationUserID string
	var cancelledAt time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT cancellation_message_id, event_id, user_id, cancelled_at
		FROM cancelled_registrations WHERE registration_id = $1
	`, registrationID).Scan(&cancellationMessageID, &cancellationEventID, &cancellationUserID, &cancelledAt)
	if err == nil {
		cancellation = &IncomingRegistrationCancellation{
			Envelope: IntegrationEnvelope{MessageID: cancellationMessageID},
			Payload: RegistrationCancelledByEventPayload{RegistrationID: registrationID,
				EventID: cancellationEventID, UserID: cancellationUserID, CancelledAt: cancelledAt},
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return PaymentConfirmedEvent{}, fmt.Errorf("load event cancellation for confirmation: %w", err)
	}
	if status == paidStatus || status == refundPendingStatus || status == refundFailedStatus || status == refundedStatus {
		paymentMessageID, err := readExistingPaymentConfirmation(ctx, tx, event.ChargeID, &event)
		if err != nil {
			return PaymentConfirmedEvent{}, err
		}
		if err := tx.Commit(); err != nil {
			return PaymentConfirmedEvent{}, fmt.Errorf("commit idempotent payment confirmation: %w", err)
		}
		if cancellation != nil && status != refundedStatus {
			if err := s.processRefundRequest(ctx, eventCancellationRefundRequest(*cancellation, event.ChargeID,
				paymentMessageID)); err != nil {
				return PaymentConfirmedEvent{}, err
			}
		}
		return event, nil
	}
	canSettleCancelledCharge := cancellation != nil && (status == cancelledStatus || status == expiredStatus)
	if status != pendingStatus && !canSettleCancelledCharge {
		return PaymentConfirmedEvent{}, ErrChargeNotPending
	}
	if provider != (SimulatedPixProvider{}).Name() {
		return PaymentConfirmedEvent{}, ErrNotSimulated
	}
	var requestEvent ChargeCreatedEvent
	var requestJSON []byte
	if err := tx.QueryRowContext(ctx, `
		SELECT payload_json FROM payment_events
		WHERE aggregate_id = $1 AND aggregate_version = 1 AND event_type = $2
	`, event.ChargeID, chargeCreatedEvent).Scan(&requestJSON); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("read ChargeCreated event for confirmation: %w", err)
	}
	if err := json.Unmarshal(requestJSON, &requestEvent); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("decode ChargeCreated event for confirmation: %w", err)
	}
	if requestEvent.Request.RegistrationID != registrationID {
		return PaymentConfirmedEvent{}, fmt.Errorf("charge request registrationId does not match projection")
	}
	paidAt := requestedPaidAt.UTC()
	if paidAt.IsZero() {
		paidAt = s.now()
	}
	processedAt := s.now()
	if paidAt.After(processedAt) {
		return PaymentConfirmedEvent{}, ErrInvalidPaidAt
	}
	event.EventID = requestEvent.Request.EventID
	event.PaidAt = paidAt
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("serialize PaymentConfirmed event: %w", err)
	}
	aggregateVersion, err := nextAggregateVersion(ctx, tx, event.ChargeID)
	if err != nil {
		return PaymentConfirmedEvent{}, err
	}
	eventID, err := newUUID()
	if err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("create PaymentConfirmed event id: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_events (id, aggregate_id, aggregate_version, event_type, payload_json, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, eventID, event.ChargeID, aggregateVersion, paymentConfirmedEvent, string(eventJSON), processedAt); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("append PaymentConfirmed event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, paid_at = $3
		WHERE charge_id = $1 AND status = $4
	`, event.ChargeID, paidStatus, paidAt, status); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("mark charge as paid: %w", err)
	}
	outboxID, err := newUUID()
	if err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("create PaymentConfirmed outbox id: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_outbox (id, event_type, aggregate_id, payload_json, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, outboxID, paymentConfirmedEvent, event.ChargeID, string(eventJSON), processedAt); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("insert PaymentConfirmed outbox event: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return PaymentConfirmedEvent{}, fmt.Errorf("commit simulated payment confirmation: %w", err)
	}
	if cancellation != nil {
		if err := s.processRefundRequest(ctx, eventCancellationRefundRequest(*cancellation, event.ChargeID, outboxID)); err != nil {
			return PaymentConfirmedEvent{}, err
		}
	}
	return event, nil
}

func readExistingPaymentConfirmation(ctx context.Context, tx *sql.Tx, chargeID string,
	event *PaymentConfirmedEvent) (string, error) {
	var payload []byte
	if err := tx.QueryRowContext(ctx, `
		SELECT payload_json FROM payment_events
		WHERE aggregate_id = $1 AND event_type = $2 ORDER BY aggregate_version DESC LIMIT 1
	`, chargeID, paymentConfirmedEvent).Scan(&payload); err != nil {
		return "", fmt.Errorf("read existing PaymentConfirmed event: %w", err)
	}
	if err := json.Unmarshal(payload, event); err != nil {
		return "", fmt.Errorf("decode existing PaymentConfirmed event: %w", err)
	}
	var messageID string
	if err := tx.QueryRowContext(ctx, `
		SELECT id FROM payment_outbox WHERE aggregate_id = $1 AND event_type = $2
		ORDER BY created_at DESC LIMIT 1
	`, chargeID, paymentConfirmedEvent).Scan(&messageID); err != nil {
		return "", fmt.Errorf("read PaymentConfirmed outbox identity: %w", err)
	}
	return messageID, nil
}

// ProcessRefundRequested persists the refund intent before calling the provider.
// A provider failure is recorded and returned so RabbitMQ retries the same
// request; the provider key remains stable for the charge across all attempts.
func (s *Store) ProcessRefund(ctx context.Context, body []byte) error {
	incoming, err := DecodeRefundRequested(body)
	if err != nil {
		return err
	}
	return s.processRefundRequest(ctx, incoming)
}

func (s *Store) processRefundRequest(ctx context.Context, incoming IncomingRefundRequest) error {
	messageHash, err := hashRefundRequest(incoming)
	if err != nil {
		return fmt.Errorf("hash refund request: %w", err)
	}

	request := incoming.Request
	idempotencyKey := RefundIdempotencyPrefix + request.ChargeID
	var amountMinor int64
	var currency, status, provider string
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin refund request transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO processed_refund_requests (message_id, charge_id, registration_id, message_hash, processed_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (message_id) DO NOTHING
	`, incoming.Envelope.MessageID, request.ChargeID, request.RegistrationID, messageHash, s.now())
	if err != nil {
		return fmt.Errorf("record processed refund request: %w", err)
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check processed refund request: %w", err)
	}
	if inserted == 0 {
		var existingChargeID, existingRegistrationID, existingHash string
		if err := tx.QueryRowContext(ctx, `
			SELECT charge_id, registration_id, message_hash
			FROM processed_refund_requests WHERE message_id = $1
		`, incoming.Envelope.MessageID).Scan(&existingChargeID, &existingRegistrationID, &existingHash); err != nil {
			return fmt.Errorf("read duplicate refund request: %w", err)
		}
		if !strings.EqualFold(existingChargeID, request.ChargeID) ||
			!strings.EqualFold(existingRegistrationID, request.RegistrationID) || existingHash != messageHash {
			return invalidRefundMessage("messageId was reused with different refund data", nil)
		}
	}

	var chargeRegistrationID string
	err = tx.QueryRowContext(ctx, `
		SELECT reference_id, amount_minor, currency, status, provider
		FROM charge_projections WHERE charge_id = $1 FOR UPDATE
	`, request.ChargeID).Scan(&chargeRegistrationID, &amountMinor, &currency, &status, &provider)
	if errors.Is(err, sql.ErrNoRows) {
		return invalidRefundMessage("charge does not exist", nil)
	}
	if err != nil {
		return fmt.Errorf("load charge for refund: %w", err)
	}
	if !strings.EqualFold(chargeRegistrationID, request.RegistrationID) {
		return invalidRefundMessage("registrationId does not match the charge", nil)
	}
	var sourceConfirmationExists bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM payment_outbox
			WHERE id = $1 AND event_type = $2 AND aggregate_id = $3
		)
	`, request.PaymentMessageID, paymentConfirmedEvent, request.ChargeID).Scan(&sourceConfirmationExists); err != nil {
		return fmt.Errorf("verify source PaymentConfirmed event: %w", err)
	}
	if !sourceConfirmationExists {
		return invalidRefundMessage("paymentMessageId does not identify this charge confirmation", nil)
	}
	if status == refundedStatus {
		return commitDuplicate(tx)
	}
	if status != paidStatus && status != refundPendingStatus && status != refundFailedStatus {
		return invalidRefundMessage("only a captured charge can be refunded", nil)
	}
	if provider != s.provider.Name() {
		return fmt.Errorf("refund provider %q is not available", provider)
	}

	if status == paidStatus || status == refundFailedStatus {
		now := s.now()
		event := RefundRequestedEvent{
			ChargeID: request.ChargeID, RegistrationID: request.RegistrationID,
			RequestMessageID: incoming.Envelope.MessageID, PaymentMessageID: request.PaymentMessageID,
			Reason: request.Reason, AmountMinor: amountMinor, Currency: currency,
			IdempotencyKey: idempotencyKey, RequestedAt: now,
		}
		if err := appendRefundEvent(ctx, tx, request.ChargeID, RefundRequestedEventType, event, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE charge_projections SET status = $2, refund_error = NULL WHERE charge_id = $1
		`, request.ChargeID, refundPendingStatus); err != nil {
			return fmt.Errorf("mark charge refund pending: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit refund request: %w", err)
	}

	providerRefund, err := s.provider.Refund(ctx, idempotencyKey, ProviderRefundRequest{
		ChargeID: request.ChargeID, AmountMinor: amountMinor, Currency: currency,
	})
	if err != nil {
		if persistErr := s.recordRefundFailure(ctx, incoming, amountMinor, currency, "PROVIDER_ERROR", err.Error()); persistErr != nil {
			return errors.Join(fmt.Errorf("refund provider: %w", err), persistErr)
		}
		return fmt.Errorf("refund provider: %w", err)
	}
	if strings.TrimSpace(providerRefund.Reference) == "" || providerRefund.RefundedAt.IsZero() {
		invalidErr := ErrInvalidRefundResponse
		if persistErr := s.recordRefundFailure(ctx, incoming, amountMinor, currency, "INVALID_PROVIDER_RESPONSE",
			invalidErr.Error()); persistErr != nil {
			return errors.Join(invalidErr, persistErr)
		}
		return invalidErr
	}
	return s.recordRefundSuccess(ctx, incoming, amountMinor, currency, providerRefund)
}

func (s *Store) recordRefundFailure(ctx context.Context, incoming IncomingRefundRequest, amountMinor int64,
	currency, failureCode, failureDetail string) error {
	request := incoming.Request
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin refund failure transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var status string
	if err := tx.QueryRowContext(ctx, `
		SELECT status FROM charge_projections WHERE charge_id = $1 FOR UPDATE
	`, request.ChargeID).Scan(&status); err != nil {
		return fmt.Errorf("load charge after refund failure: %w", err)
	}
	if status == refundedStatus {
		return commitDuplicate(tx)
	}
	failedAt := s.now()
	event := RefundFailedEvent{
		ChargeID: request.ChargeID, RegistrationID: request.RegistrationID,
		RequestMessageID: incoming.Envelope.MessageID, AmountMinor: amountMinor, Currency: currency,
		FailureCode: failureCode, FailureDetail: failureDetail, FailedAt: failedAt,
	}
	if err := appendRefundEvent(ctx, tx, request.ChargeID, RefundFailedEventType, event, failedAt); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, refund_error = $3 WHERE charge_id = $1
	`, request.ChargeID, refundFailedStatus, failureDetail); err != nil {
		return fmt.Errorf("mark charge refund failed: %w", err)
	}
	payload := RefundFailedPayload{
		ChargeID: request.ChargeID, RegistrationID: request.RegistrationID,
		RequestMessageID: incoming.Envelope.MessageID, FailureCode: failureCode, FailedAt: failedAt,
	}
	if err := insertRefundOutbox(ctx, tx, RefundFailedEventType, request.ChargeID, payload, failedAt); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit refund failure: %w", err)
	}
	return nil
}

func (s *Store) recordRefundSuccess(ctx context.Context, incoming IncomingRefundRequest, amountMinor int64,
	currency string, providerRefund ProviderRefund) error {
	request := incoming.Request
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin refund success transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var status string
	if err := tx.QueryRowContext(ctx, `
		SELECT status FROM charge_projections WHERE charge_id = $1 FOR UPDATE
	`, request.ChargeID).Scan(&status); err != nil {
		return fmt.Errorf("load charge after refund: %w", err)
	}
	if status == refundedStatus {
		return commitDuplicate(tx)
	}
	if status != refundPendingStatus && status != refundFailedStatus {
		return fmt.Errorf("charge status %s cannot be marked refunded", status)
	}
	refundedAt := providerRefund.RefundedAt.UTC()
	event := RefundSucceededEvent{
		ChargeID: request.ChargeID, RegistrationID: request.RegistrationID,
		RequestMessageID: incoming.Envelope.MessageID, AmountMinor: amountMinor, Currency: currency,
		ProviderRefundReference: providerRefund.Reference, RefundedAt: refundedAt,
	}
	if err := appendRefundEvent(ctx, tx, request.ChargeID, RefundSucceededEventType, event, refundedAt); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, refunded_at = $3, refund_reference = $4, refund_error = NULL
		WHERE charge_id = $1
	`, request.ChargeID, refundedStatus, refundedAt, providerRefund.Reference); err != nil {
		return fmt.Errorf("mark charge refunded: %w", err)
	}
	payload := RefundSucceededPayload{
		ChargeID: request.ChargeID, RegistrationID: request.RegistrationID,
		RequestMessageID: incoming.Envelope.MessageID, AmountMinor: amountMinor,
		Currency: currency, RefundedAt: refundedAt,
	}
	if err := insertRefundOutbox(ctx, tx, RefundSucceededEventType, request.ChargeID, payload, refundedAt); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit refund success: %w", err)
	}
	return nil
}

type RefundRequestedEvent struct {
	ChargeID         string    `json:"chargeId"`
	RegistrationID   string    `json:"registrationId"`
	RequestMessageID string    `json:"requestMessageId"`
	PaymentMessageID string    `json:"paymentMessageId"`
	Reason           string    `json:"reason"`
	AmountMinor      int64     `json:"amountMinor"`
	Currency         string    `json:"currency"`
	IdempotencyKey   string    `json:"idempotencyKey"`
	RequestedAt      time.Time `json:"requestedAt"`
}

type RefundFailedEvent struct {
	ChargeID         string    `json:"chargeId"`
	RegistrationID   string    `json:"registrationId"`
	RequestMessageID string    `json:"requestMessageId"`
	AmountMinor      int64     `json:"amountMinor"`
	Currency         string    `json:"currency"`
	FailureCode      string    `json:"failureCode"`
	FailureDetail    string    `json:"failureDetail"`
	FailedAt         time.Time `json:"failedAt"`
}

type RefundSucceededEvent struct {
	ChargeID                string    `json:"chargeId"`
	RegistrationID          string    `json:"registrationId"`
	RequestMessageID        string    `json:"requestMessageId"`
	AmountMinor             int64     `json:"amountMinor"`
	Currency                string    `json:"currency"`
	ProviderRefundReference string    `json:"providerRefundReference"`
	RefundedAt              time.Time `json:"refundedAt"`
}

type RefundSucceededPayload struct {
	ChargeID         string    `json:"chargeId"`
	RegistrationID   string    `json:"registrationId"`
	RequestMessageID string    `json:"requestMessageId"`
	AmountMinor      int64     `json:"amountMinor"`
	Currency         string    `json:"currency"`
	RefundedAt       time.Time `json:"refundedAt"`
}

type RefundFailedPayload struct {
	ChargeID         string    `json:"chargeId"`
	RegistrationID   string    `json:"registrationId"`
	RequestMessageID string    `json:"requestMessageId"`
	FailureCode      string    `json:"failureCode"`
	FailedAt         time.Time `json:"failedAt"`
}

func appendRefundEvent(ctx context.Context, tx *sql.Tx, chargeID, eventType string, event any,
	occurredAt time.Time) error {
	version, err := nextAggregateVersion(ctx, tx, chargeID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("serialize %s event: %w", eventType, err)
	}
	eventID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create %s event id: %w", eventType, err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_events (id, aggregate_id, aggregate_version, event_type, payload_json, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, eventID, chargeID, version, eventType, string(payload), occurredAt); err != nil {
		return fmt.Errorf("append %s event: %w", eventType, err)
	}
	return nil
}

func nextAggregateVersion(ctx context.Context, tx *sql.Tx, chargeID string) (int64, error) {
	var version int64
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(aggregate_version), 0) + 1 FROM payment_events WHERE aggregate_id = $1
	`, chargeID).Scan(&version); err != nil {
		return 0, fmt.Errorf("read next Payment event version: %w", err)
	}
	return version, nil
}

func insertRefundOutbox(ctx context.Context, tx *sql.Tx, eventType, chargeID string, payload any,
	createdAt time.Time) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("serialize %s Outbox payload: %w", eventType, err)
	}
	outboxID, err := newUUID()
	if err != nil {
		return fmt.Errorf("create %s Outbox id: %w", eventType, err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_outbox (id, event_type, aggregate_id, payload_json, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, outboxID, eventType, chargeID, string(encoded), createdAt); err != nil {
		return fmt.Errorf("insert %s Outbox event: %w", eventType, err)
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
		switch stored.eventType {
		case chargeCreatedEvent:
			var event ChargeCreatedEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode ChargeCreated event: %w", err)
			}
			if err := insertProjection(ctx, tx, event); err != nil {
				return err
			}
		case paymentExpiredEvent:
			var event PaymentExpiredEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode PaymentExpired event: %w", err)
			}
			if err := insertExpiredProjection(ctx, tx, event); err != nil {
				return err
			}
		case paymentConfirmedEvent:
			var event PaymentConfirmedEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode PaymentConfirmed event: %w", err)
			}
			if err := markProjectionPaid(ctx, tx, event); err != nil {
				return err
			}
		case chargeCancelledEvent:
			var event ChargeCancelledEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode ChargeCancelled event: %w", err)
			}
			if err := markProjectionCancelled(ctx, tx, event); err != nil {
				return err
			}
		case RefundRequestedEventType:
			var event RefundRequestedEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode RefundRequested event: %w", err)
			}
			if err := markProjectionRefundPending(ctx, tx, event); err != nil {
				return err
			}
		case RefundFailedEventType:
			var event RefundFailedEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode RefundFailed event: %w", err)
			}
			if err := markProjectionRefundFailed(ctx, tx, event); err != nil {
				return err
			}
		case RefundSucceededEventType:
			var event RefundSucceededEvent
			if err := json.Unmarshal(stored.payloadJSON, &event); err != nil {
				return fmt.Errorf("decode RefundSucceeded event: %w", err)
			}
			if err := markProjectionRefunded(ctx, tx, event); err != nil {
				return err
			}
		default:
			return fmt.Errorf("cannot rebuild projection from unsupported PaymentEvent %q", stored.eventType)
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

// PaymentExpiredEvent is an internal terminal result: a late request is stored
// for idempotency and audit but never sent to a provider.
type PaymentExpiredEvent struct {
	ChargeID   string                     `json:"chargeId"`
	Request    RegistrationPaymentRequest `json:"request"`
	Status     string                     `json:"status"`
	Provider   string                     `json:"provider"`
	OccurredAt time.Time                  `json:"occurredAt"`
}

// PaymentConfirmedEvent is the v1 event shared with Engagement. PaidAt is the
// effective time reported by the provider, distinct from envelope occurredAt.
type PaymentConfirmedEvent struct {
	ChargeID       string    `json:"chargeId"`
	RegistrationID string    `json:"registrationId"`
	EventID        string    `json:"eventId"`
	UserID         string    `json:"userId"`
	AmountMinor    int64     `json:"amountMinor"`
	Currency       string    `json:"currency"`
	PaidAt         time.Time `json:"paidAt"`
}

type ChargeCancelledEvent struct {
	ChargeID              string    `json:"chargeId"`
	RegistrationID        string    `json:"registrationId"`
	EventID               string    `json:"eventId"`
	Status                string    `json:"status"`
	CancellationMessageID string    `json:"cancellationMessageId"`
	CancelledAt           time.Time `json:"cancelledAt"`
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

func insertExpiredProjection(ctx context.Context, tx *sql.Tx, event PaymentExpiredEvent) error {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO charge_projections (
			charge_id, reference_type, reference_id, payer_user_id, amount_minor, currency,
			status, provider, provider_reference, pix_copy_paste, qr_code_url, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10)
	`, event.ChargeID, RegistrationReferenceType, event.Request.RegistrationID, event.Request.UserID,
		event.Request.AmountMinor, event.Request.Currency, event.Status, event.Provider, event.OccurredAt,
		event.Request.PaymentDeadlineAt); err != nil {
		return fmt.Errorf("rebuild expired payment %s projection: %w", event.ChargeID, err)
	}
	return nil
}

func markProjectionPaid(ctx context.Context, tx *sql.Tx, event PaymentConfirmedEvent) error {
	if _, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, paid_at = $3 WHERE charge_id = $1
	`, event.ChargeID, paidStatus, event.PaidAt); err != nil {
		return fmt.Errorf("rebuild paid charge %s projection: %w", event.ChargeID, err)
	}
	return nil
}

func markProjectionCancelled(ctx context.Context, tx *sql.Tx, event ChargeCancelledEvent) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2 WHERE charge_id = $1
	`, event.ChargeID, cancelledStatus)
	if err != nil {
		return fmt.Errorf("rebuild cancelled charge %s projection: %w", event.ChargeID, err)
	}
	return requireProjectionUpdate(result, event.ChargeID, "cancelled")
}

func markProjectionRefundPending(ctx context.Context, tx *sql.Tx, event RefundRequestedEvent) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, refund_error = NULL WHERE charge_id = $1
	`, event.ChargeID, refundPendingStatus)
	if err != nil {
		return fmt.Errorf("rebuild refund-pending charge %s projection: %w", event.ChargeID, err)
	}
	return requireProjectionUpdate(result, event.ChargeID, "refund pending")
}

func markProjectionRefundFailed(ctx context.Context, tx *sql.Tx, event RefundFailedEvent) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE charge_projections SET status = $2, refund_error = $3 WHERE charge_id = $1
	`, event.ChargeID, refundFailedStatus, event.FailureDetail)
	if err != nil {
		return fmt.Errorf("rebuild refund-failed charge %s projection: %w", event.ChargeID, err)
	}
	return requireProjectionUpdate(result, event.ChargeID, "refund failed")
}

func markProjectionRefunded(ctx context.Context, tx *sql.Tx, event RefundSucceededEvent) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE charge_projections
		SET status = $2, refunded_at = $3, refund_reference = $4, refund_error = NULL
		WHERE charge_id = $1
	`, event.ChargeID, refundedStatus, event.RefundedAt, event.ProviderRefundReference)
	if err != nil {
		return fmt.Errorf("rebuild refunded charge %s projection: %w", event.ChargeID, err)
	}
	return requireProjectionUpdate(result, event.ChargeID, "refunded")
}

func requireProjectionUpdate(result sql.Result, chargeID, status string) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check %s projection update for %s: %w", status, chargeID, err)
	}
	if updated != 1 {
		return fmt.Errorf("%s projection for charge %s does not exist", status, chargeID)
	}
	return nil
}

func requestFromInitialEvent(eventType string, payloadJSON []byte) (RegistrationPaymentRequest, error) {
	switch eventType {
	case chargeCreatedEvent:
		var event ChargeCreatedEvent
		if err := json.Unmarshal(payloadJSON, &event); err != nil {
			return RegistrationPaymentRequest{}, fmt.Errorf("decode existing ChargeCreated event: %w", err)
		}
		return event.Request, nil
	case paymentExpiredEvent:
		var event PaymentExpiredEvent
		if err := json.Unmarshal(payloadJSON, &event); err != nil {
			return RegistrationPaymentRequest{}, fmt.Errorf("decode existing PaymentExpired event: %w", err)
		}
		return event.Request, nil
	default:
		return RegistrationPaymentRequest{}, fmt.Errorf("unsupported initial PaymentEvent %q", eventType)
	}
}

func stableChargeID(registrationID string) string {
	// UUIDv5 in a fixed application namespace keeps the charge identity stable
	// when a provider request is retried after a database or broker failure.
	namespace := [16]byte{0x59, 0x2f, 0x6b, 0x4a, 0x1f, 0xe7, 0x5c, 0x84,
		0xa2, 0x1b, 0xd5, 0x9b, 0x67, 0x4f, 0x0c, 0x11}
	name := []byte("unir-payment-charge:" + strings.ToLower(registrationID))
	input := append(namespace[:], name...)
	hash := sha1.Sum(input)
	value := hash[:16]
	value[6] = (value[6] & 0x0f) | 0x50
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
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
