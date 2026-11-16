package payment

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestProcessCreatesOnePendingChargeEventProjectionAndOutbox(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	hash, _ := hashEnvelope(incoming)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), chargeCreatedEvent,
			jsonWithFields(t, map[string]any{"status": pendingStatus, "provider": "TEST"}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(sqlmock.AnyArg(), RegistrationReferenceType, incoming.Request.RegistrationID,
			incoming.Request.UserID, int64(2500), "BRL", pendingStatus, "TEST", sqlmock.AnyArg(),
			sqlmock.AnyArg(), "", sqlmock.AnyArg(), incoming.Request.PaymentDeadlineAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), chargeCreatedEvent, sqlmock.AnyArg(),
			jsonWithFields(t, map[string]any{"status": pendingStatus, "request": map[string]any{"amountMinor": float64(2500)}}),
			sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	provider := &recordingProvider{}
	store := NewStore(db, provider)
	store.now = func() time.Time { return time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC) }
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err != nil {
		t.Fatalf("process charge request: %v", err)
	}
	if provider.idempotencyKey != incoming.Request.RegistrationID || provider.calls != 1 {
		t.Fatalf("provider should receive the stable registration key once, got key=%q calls=%d",
			provider.idempotencyKey, provider.calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestDuplicateRegistrationWithAnotherMessageIDDoesNotCreateAnotherCharge(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	body := []byte(replaceOnce(validEnvelopeJSON,
		"550e8400-e29b-41d4-a716-446655440001",
		"550e8400-e29b-41d4-a716-446655440011"))
	incoming, _ := DecodeRegistrationPayment(body)
	hash, _ := hashEnvelope(incoming)
	existingEvent := ChargeCreatedEvent{
		ChargeID:  "550e8400-e29b-41d4-a716-446655440010",
		Request:   incoming.Request,
		Status:    pendingStatus,
		Provider:  "SIMULATED",
		CreatedAt: time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC),
		ExpiresAt: incoming.Request.PaymentDeadlineAt,
	}
	eventJSON, _ := json.Marshal(existingEvent)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id"}).AddRow(existingEvent.ChargeID))
	mock.ExpectQuery("SELECT event_type, payload_json FROM payment_events").
		WithArgs(existingEvent.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"event_type", "payload_json"}).AddRow(chargeCreatedEvent, eventJSON))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	if err := store.Process(context.Background(), body); err != nil {
		t.Fatalf("process duplicate registration: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestDuplicateMessageIDIsAcknowledgableWithoutNewFinancialRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	hash, _ := hashEnvelope(incoming)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT registration_id, message_hash FROM processed_messages").
		WithArgs(incoming.Envelope.MessageID).
		WillReturnRows(sqlmock.NewRows([]string{"registration_id", "message_hash"}).
			AddRow(incoming.Request.RegistrationID, hash))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err != nil {
		t.Fatalf("process repeated broker delivery: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestMessageIDCannotBeReusedForDifferentPayload(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	original, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	originalHash, _ := hashEnvelope(original)
	changedBody := []byte(replaceOnce(validEnvelopeJSON, `"amountMinor":2500`, `"amountMinor":3500`))
	changed, _ := DecodeRegistrationPayment(changedBody)
	changedHash, _ := hashEnvelope(changed)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(changed.Envelope.MessageID, changed.Request.RegistrationID, changedHash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT registration_id, message_hash FROM processed_messages").
		WithArgs(changed.Envelope.MessageID).
		WillReturnRows(sqlmock.NewRows([]string{"registration_id", "message_hash"}).
			AddRow(original.Request.RegistrationID, originalHash))
	mock.ExpectRollback()

	store := NewStore(db, SimulatedPixProvider{})
	err = store.Process(context.Background(), changedBody)
	if !errors.Is(err, ErrInvalidMessage) {
		t.Fatalf("expected invalid message id reuse, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestDatabaseFailureReturnsErrorForRabbitRetry(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()
	mock.ExpectBegin().WillReturnError(errors.New("connection refused"))

	store := NewStore(db, SimulatedPixProvider{})
	err = store.Process(context.Background(), []byte(validEnvelopeJSON))
	if err == nil || errors.Is(err, ErrInvalidMessage) {
		t.Fatalf("expected retryable database error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestEventProjectionOutboxFailureRollsBackTheTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	hash, _ := hashEnvelope(incoming)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), chargeCreatedEvent, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(sqlmock.AnyArg(), RegistrationReferenceType, incoming.Request.RegistrationID,
			incoming.Request.UserID, int64(2500), "BRL", pendingStatus, "SIMULATED", sqlmock.AnyArg(),
			sqlmock.AnyArg(), "", sqlmock.AnyArg(), incoming.Request.PaymentDeadlineAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").WillReturnError(errors.New("database write failed"))
	mock.ExpectRollback()

	store := NewStore(db, SimulatedPixProvider{})
	store.now = func() time.Time { return time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC) }
	err = store.Process(context.Background(), []byte(validEnvelopeJSON))
	if err == nil {
		t.Fatal("expected Outbox error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRebuildProjectionReplaysChargeCreatedEvent(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	event := ChargeCreatedEvent{
		ChargeID:          "550e8400-e29b-41d4-a716-446655440010",
		Request:           incoming.Request,
		Status:            pendingStatus,
		Provider:          "SIMULATED",
		ProviderReference: "simulated-charge",
		CreatedAt:         time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC),
		ExpiresAt:         incoming.Request.PaymentDeadlineAt,
	}
	eventJSON, _ := json.Marshal(event)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM charge_projections").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT event_type, payload_json FROM payment_events").
		WillReturnRows(sqlmock.NewRows([]string{"event_type", "payload_json"}).AddRow(chargeCreatedEvent, eventJSON))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(event.ChargeID, RegistrationReferenceType, incoming.Request.RegistrationID,
			incoming.Request.UserID, int64(2500), "BRL", pendingStatus, "SIMULATED", event.ProviderReference,
			sqlmock.AnyArg(), "", event.CreatedAt, event.ExpiresAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	if err := store.RebuildProjection(context.Background()); err != nil {
		t.Fatalf("rebuild projection: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRebuildProjectionAppliesPaymentConfirmedAfterChargeCreated(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	chargeID := stableChargeID(incoming.Request.RegistrationID)
	createdAt := time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC)
	paidAt := createdAt.Add(3 * time.Minute)
	created := ChargeCreatedEvent{ChargeID: chargeID, Request: incoming.Request, Status: pendingStatus,
		Provider: "SIMULATED", ProviderReference: "simulated-reference", CreatedAt: createdAt,
		ExpiresAt: incoming.Request.PaymentDeadlineAt}
	confirmed := PaymentConfirmedEvent{ChargeID: chargeID, RegistrationID: incoming.Request.RegistrationID,
		EventID: incoming.Request.EventID, UserID: incoming.Request.UserID, AmountMinor: incoming.Request.AmountMinor,
		Currency: incoming.Request.Currency, PaidAt: paidAt}
	refundRequested := RefundRequestedEvent{ChargeID: chargeID, RegistrationID: incoming.Request.RegistrationID,
		RequestMessageID: "744019a0-f221-4fb5-8e41-ccba14af00d1", PaymentMessageID: "2b4869bb-6466-4f3e-97bf-a060bde93ea0",
		Reason: "RESERVATION_EXPIRED", AmountMinor: 2500, Currency: "BRL",
		IdempotencyKey: RefundIdempotencyPrefix + chargeID, RequestedAt: paidAt.Add(time.Minute)}
	refundFailed := RefundFailedEvent{ChargeID: chargeID, RegistrationID: incoming.Request.RegistrationID,
		RequestMessageID: refundRequested.RequestMessageID, AmountMinor: 2500, Currency: "BRL",
		FailureCode: "PROVIDER_ERROR", FailureDetail: "temporary outage", FailedAt: paidAt.Add(2 * time.Minute)}
	refundSucceeded := RefundSucceededEvent{ChargeID: chargeID, RegistrationID: incoming.Request.RegistrationID,
		RequestMessageID: refundRequested.RequestMessageID, AmountMinor: 2500, Currency: "BRL",
		ProviderRefundReference: "simulated-refund-reference", RefundedAt: paidAt.Add(3 * time.Minute)}
	createdJSON, _ := json.Marshal(created)
	confirmedJSON, _ := json.Marshal(confirmed)
	refundRequestedJSON, _ := json.Marshal(refundRequested)
	refundFailedJSON, _ := json.Marshal(refundFailed)
	refundSucceededJSON, _ := json.Marshal(refundSucceeded)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM charge_projections").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT event_type, payload_json FROM payment_events").
		WillReturnRows(sqlmock.NewRows([]string{"event_type", "payload_json"}).
			AddRow(chargeCreatedEvent, createdJSON).AddRow(paymentConfirmedEvent, confirmedJSON).
			AddRow(RefundRequestedEventType, refundRequestedJSON).AddRow(RefundFailedEventType, refundFailedJSON).
			AddRow(RefundRequestedEventType, refundRequestedJSON).AddRow(RefundSucceededEventType, refundSucceededJSON))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(chargeID, RegistrationReferenceType, incoming.Request.RegistrationID, incoming.Request.UserID,
			incoming.Request.AmountMinor, incoming.Request.Currency, pendingStatus, "SIMULATED", "simulated-reference",
			sqlmock.AnyArg(), "", createdAt, incoming.Request.PaymentDeadlineAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections SET status").
		WithArgs(chargeID, paidStatus, paidAt).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = NULL`).
		WithArgs(chargeID, refundPendingStatus).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = \$3`).
		WithArgs(chargeID, refundFailedStatus, refundFailed.FailureDetail).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = NULL`).
		WithArgs(chargeID, refundPendingStatus).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections").
		WithArgs(chargeID, refundedStatus, refundSucceeded.RefundedAt, refundSucceeded.ProviderRefundReference).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	if err := store.RebuildProjection(context.Background()); err != nil {
		t.Fatalf("rebuild paid charge projection: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestExpiredRequestIsPersistedWithoutCallingProvider(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	deadline := time.Date(2026, 11, 16, 15, 10, 0, 0, time.UTC)
	body := []byte(replaceOnce(validEnvelopeJSON, "2026-11-16T15:10:00Z", deadline.Format(time.RFC3339)))
	incoming, err := DecodeRegistrationPayment(body)
	if err != nil {
		t.Fatalf("decode request: %v", err)
	}
	hash, _ := hashEnvelope(incoming)
	chargeID := stableChargeID(incoming.Request.RegistrationID)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), chargeID, paymentExpiredEvent,
			jsonWithFields(t, map[string]any{"status": expiredStatus, "provider": "NONE"}), deadline).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(chargeID, RegistrationReferenceType, incoming.Request.RegistrationID, incoming.Request.UserID,
			int64(2500), "BRL", expiredStatus, "NONE", deadline, incoming.Request.PaymentDeadlineAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	provider := &recordingProvider{}
	store := NewStore(db, provider)
	store.now = func() time.Time { return deadline }
	if err := store.Process(context.Background(), body); err != nil {
		t.Fatalf("persist expired request: %v", err)
	}
	if provider.calls != 0 {
		t.Fatalf("expired request must not call provider, got %d calls", provider.calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestExpiredRequestWithAnotherMessageIDRemainsTerminal(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	body := []byte(replaceOnce(validEnvelopeJSON,
		"550e8400-e29b-41d4-a716-446655440001",
		"550e8400-e29b-41d4-a716-446655440011"))
	incoming, _ := DecodeRegistrationPayment(body)
	hash, _ := hashEnvelope(incoming)
	expired := PaymentExpiredEvent{ChargeID: stableChargeID(incoming.Request.RegistrationID),
		Request: incoming.Request, Status: expiredStatus, Provider: "NONE",
		OccurredAt: incoming.Request.PaymentDeadlineAt}
	eventJSON, _ := json.Marshal(expired)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id"}).AddRow(expired.ChargeID))
	mock.ExpectQuery("SELECT event_type, payload_json FROM payment_events").
		WithArgs(expired.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"event_type", "payload_json"}).AddRow(paymentExpiredEvent, eventJSON))
	mock.ExpectCommit()

	provider := &recordingProvider{}
	store := NewStore(db, provider)
	if err := store.Process(context.Background(), body); err != nil {
		t.Fatalf("process duplicate expired request: %v", err)
	}
	if provider.calls != 0 {
		t.Fatalf("duplicate expired request must not call provider, got %d calls", provider.calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestPaymentRequestAfterRegistrationCancellationDoesNotCreateCharge(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()
	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	hash, _ := hashEnvelope(incoming)
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_messages").
		WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_registration_gates").
		WithArgs(incoming.Request.RegistrationID).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT cancelled FROM payment_registration_gates").
		WithArgs(incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"cancelled"}).AddRow(true))
	mock.ExpectQuery("SELECT event_id, user_id FROM cancelled_registrations").
		WithArgs(incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"event_id", "user_id"}).
			AddRow(incoming.Request.EventID, incoming.Request.UserID))
	mock.ExpectCommit()
	provider := &recordingProvider{}
	store := NewStore(db, provider)
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err != nil {
		t.Fatalf("ack payment request for cancelled registration: %v", err)
	}
	if provider.calls != 0 {
		t.Fatalf("cancelled registration must not reach the provider, got %d calls", provider.calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestStableChargeIDIsDeterministicPerRegistration(t *testing.T) {
	registrationID := "550e8400-e29b-41d4-a716-446655440002"
	first := stableChargeID(registrationID)
	second := stableChargeID(strings.ToUpper(registrationID))
	if first != second || !uuidPattern.MatchString(first) {
		t.Fatalf("expected stable UUID charge ID, got %q and %q", first, second)
	}
}

func TestProviderIdempotencyKeyRemainsStableAfterTransactionRetry(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	hash, _ := hashEnvelope(incoming)
	now := time.Date(2026, 11, 16, 15, 1, 0, 0, time.UTC)
	for attempt := 0; attempt < 2; attempt++ {
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO processed_messages").
			WithArgs(incoming.Envelope.MessageID, incoming.Request.RegistrationID, hash, sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))
		expectActiveRegistrationGate(mock, incoming.Request.RegistrationID)
		mock.ExpectQuery("SELECT charge_id FROM charge_projections").
			WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
			WillReturnError(sql.ErrNoRows)
		mock.ExpectExec("INSERT INTO payment_events").
			WithArgs(sqlmock.AnyArg(), stableChargeID(incoming.Request.RegistrationID), chargeCreatedEvent,
				sqlmock.AnyArg(), now).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("INSERT INTO charge_projections").
			WithArgs(stableChargeID(incoming.Request.RegistrationID), RegistrationReferenceType,
				incoming.Request.RegistrationID, incoming.Request.UserID, incoming.Request.AmountMinor,
				incoming.Request.Currency, pendingStatus, "TEST", sqlmock.AnyArg(), sqlmock.AnyArg(), "", now,
				incoming.Request.PaymentDeadlineAt).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("INSERT INTO payment_outbox").WillReturnResult(sqlmock.NewResult(0, 1))
		if attempt == 0 {
			mock.ExpectCommit().WillReturnError(errors.New("database connection lost during commit"))
		} else {
			mock.ExpectCommit()
		}
	}

	provider := &recordingProvider{}
	store := NewStore(db, provider)
	store.now = func() time.Time { return now }
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err == nil {
		t.Fatal("expected the first transaction to fail")
	}
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err != nil {
		t.Fatalf("retry payment request: %v", err)
	}
	if provider.calls != 2 || provider.idempotencyKey != incoming.Request.RegistrationID {
		t.Fatalf("expected two calls with the stable registration key, got calls=%d key=%q", provider.calls,
			provider.idempotencyKey)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestSimulatedPaymentConfirmationPersistsEventProjectionAndOutboxAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	created := ChargeCreatedEvent{ChargeID: stableChargeID(incoming.Request.RegistrationID),
		Request: incoming.Request, Status: pendingStatus, Provider: "SIMULATED"}
	createdJSON, _ := json.Marshal(created)
	paidAt := time.Date(2026, 11, 16, 15, 4, 0, 0, time.UTC)
	confirmed := PaymentConfirmedEvent{
		ChargeID: created.ChargeID, RegistrationID: incoming.Request.RegistrationID,
		EventID: incoming.Request.EventID, UserID: incoming.Request.UserID,
		AmountMinor: incoming.Request.AmountMinor, Currency: incoming.Request.Currency, PaidAt: paidAt,
	}
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT charge_id, reference_id, payer_user_id, amount_minor, currency, status, provider").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id", "reference_id", "payer_user_id", "amount_minor",
			"currency", "status", "provider"}).AddRow(confirmed.ChargeID, confirmed.RegistrationID,
			confirmed.UserID, confirmed.AmountMinor, confirmed.Currency, pendingStatus, "SIMULATED"))
	mock.ExpectQuery("SELECT cancellation_message_id, event_id, user_id, cancelled_at FROM cancelled_registrations").
		WithArgs(incoming.Request.RegistrationID).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery("SELECT payload_json FROM payment_events").
		WithArgs(confirmed.ChargeID, chargeCreatedEvent).
		WillReturnRows(sqlmock.NewRows([]string{"payload_json"}).AddRow(createdJSON))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1 FROM payment_events`).
		WithArgs(confirmed.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"coalesce"}).AddRow(int64(2)))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), confirmed.ChargeID, int64(2), paymentConfirmedEvent,
			jsonWithFields(t, map[string]any{"registrationId": confirmed.RegistrationID,
				"eventId": confirmed.EventID, "paidAt": paidAt.Format(time.RFC3339Nano)}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections SET status").
		WithArgs(confirmed.ChargeID, paidStatus, paidAt, pendingStatus).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), paymentConfirmedEvent, confirmed.ChargeID,
			jsonWithFields(t, map[string]any{"registrationId": confirmed.RegistrationID,
				"eventId": confirmed.EventID, "paidAt": paidAt.Format(time.RFC3339Nano)}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	store.now = func() time.Time { return paidAt }
	got, err := store.ConfirmSimulatedPayment(context.Background(), incoming.Request.RegistrationID, paidAt)
	if err != nil {
		t.Fatalf("confirm simulated payment: %v", err)
	}
	if got != confirmed {
		t.Fatalf("unexpected PaymentConfirmed event: got %+v want %+v", got, confirmed)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestConfirmationOutboxFailureRollsBackPaidTransition(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	created := ChargeCreatedEvent{ChargeID: stableChargeID(incoming.Request.RegistrationID),
		Request: incoming.Request, Status: pendingStatus, Provider: "SIMULATED"}
	createdJSON, _ := json.Marshal(created)
	paidAt := time.Date(2026, 11, 16, 15, 4, 0, 0, time.UTC)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT charge_id, reference_id, payer_user_id, amount_minor, currency, status, provider").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id", "reference_id", "payer_user_id", "amount_minor",
			"currency", "status", "provider"}).AddRow(created.ChargeID, incoming.Request.RegistrationID,
			incoming.Request.UserID, incoming.Request.AmountMinor, incoming.Request.Currency, pendingStatus, "SIMULATED"))
	mock.ExpectQuery("SELECT cancellation_message_id, event_id, user_id, cancelled_at FROM cancelled_registrations").
		WithArgs(incoming.Request.RegistrationID).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery("SELECT payload_json FROM payment_events").
		WithArgs(created.ChargeID, chargeCreatedEvent).
		WillReturnRows(sqlmock.NewRows([]string{"payload_json"}).AddRow(createdJSON))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1 FROM payment_events`).
		WithArgs(created.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"coalesce"}).AddRow(int64(2)))
	mock.ExpectExec("INSERT INTO payment_events").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections SET status").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").WillReturnError(errors.New("outbox unavailable"))
	mock.ExpectRollback()

	store := NewStore(db, SimulatedPixProvider{})
	store.now = func() time.Time { return paidAt }
	if _, err := store.ConfirmSimulatedPayment(context.Background(), incoming.Request.RegistrationID, paidAt); err == nil {
		t.Fatal("expected confirmation Outbox failure")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRepeatedSimulatedConfirmationDoesNotAppendAnotherEvent(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	confirmed := PaymentConfirmedEvent{
		ChargeID: stableChargeID(incoming.Request.RegistrationID), RegistrationID: incoming.Request.RegistrationID,
		EventID: incoming.Request.EventID, UserID: incoming.Request.UserID, AmountMinor: incoming.Request.AmountMinor,
		Currency: incoming.Request.Currency, PaidAt: time.Date(2026, 11, 16, 15, 4, 0, 0, time.UTC),
	}
	confirmedJSON, _ := json.Marshal(confirmed)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT charge_id, reference_id, payer_user_id, amount_minor, currency, status, provider").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id", "reference_id", "payer_user_id", "amount_minor",
			"currency", "status", "provider"}).AddRow(confirmed.ChargeID, confirmed.RegistrationID,
			confirmed.UserID, confirmed.AmountMinor, confirmed.Currency, paidStatus, "SIMULATED"))
	mock.ExpectQuery("SELECT cancellation_message_id, event_id, user_id, cancelled_at FROM cancelled_registrations").
		WithArgs(incoming.Request.RegistrationID).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery("SELECT payload_json FROM payment_events").
		WithArgs(confirmed.ChargeID, paymentConfirmedEvent).
		WillReturnRows(sqlmock.NewRows([]string{"payload_json"}).AddRow(confirmedJSON))
	mock.ExpectQuery("SELECT id FROM payment_outbox").
		WithArgs(confirmed.ChargeID, paymentConfirmedEvent).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("d269af7b-52b8-414d-8806-b370204f75aa"))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	got, err := store.ConfirmSimulatedPayment(context.Background(), incoming.Request.RegistrationID, time.Time{})
	if err != nil {
		t.Fatalf("repeat simulated confirmation: %v", err)
	}
	if got != confirmed {
		t.Fatalf("expected prior confirmation result, got %+v want %+v", got, confirmed)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRefundRequestPersistsFullRefundAndDuplicateDoesNotRefundAgain(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, err := DecodeRefundRequested([]byte(validRefundEnvelopeJSON))
	if err != nil {
		t.Fatalf("decode refund request: %v", err)
	}
	hash, _ := hashRefundRequest(incoming)
	request := incoming.Request
	chargeID := request.ChargeID
	registrationID := request.RegistrationID
	paymentMessageID := request.PaymentMessageID
	refundedAt := time.Date(2026, 11, 16, 15, 16, 0, 0, time.UTC)
	provider := &recordingProvider{refundResult: ProviderRefund{
		Reference:  "simulated-refund-" + RefundIdempotencyPrefix + chargeID,
		RefundedAt: refundedAt,
	}}
	store := NewStore(db, provider)
	store.now = func() time.Time { return refundedAt }

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID, chargeID, registrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT reference_id, amount_minor, currency, status, provider").
		WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"reference_id", "amount_minor", "currency", "status", "provider"}).
			AddRow(registrationID, int64(2500), "BRL", paidStatus, "TEST"))
	mock.ExpectQuery("SELECT EXISTS").
		WithArgs(paymentMessageID, paymentConfirmedEvent, chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).
		WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(int64(3)))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), chargeID, int64(3), RefundRequestedEventType,
			jsonWithFields(t, map[string]any{"idempotencyKey": RefundIdempotencyPrefix + chargeID,
				"amountMinor": float64(2500), "currency": "BRL"}), refundedAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = NULL`).
		WithArgs(chargeID, refundPendingStatus).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM charge_projections").
		WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(refundPendingStatus))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).
		WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(int64(4)))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), chargeID, int64(4), RefundSucceededEventType,
			jsonWithFields(t, map[string]any{"providerRefundReference": provider.refundResult.Reference,
				"amountMinor": float64(2500), "currency": "BRL"}), refundedAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections").
		WithArgs(chargeID, refundedStatus, refundedAt, provider.refundResult.Reference).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), RefundSucceededEventType, chargeID,
			jsonWithFields(t, map[string]any{"chargeId": chargeID, "registrationId": registrationID,
				"requestMessageId": incoming.Envelope.MessageID, "amountMinor": float64(2500),
				"currency": "BRL"}), refundedAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err != nil {
		t.Fatalf("process full refund: %v", err)
	}
	if provider.refundIdempotencyKey != RefundIdempotencyPrefix+chargeID || provider.refundCalls != 1 ||
		provider.refundRequest.AmountMinor != 2500 || provider.refundRequest.Currency != "BRL" {
		t.Fatalf("provider did not receive a stable full-refund request: %+v calls=%d",
			provider.refundRequest, provider.refundCalls)
	}

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID, chargeID, registrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT charge_id, registration_id, message_hash FROM processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id", "registration_id", "message_hash"}).
			AddRow(chargeID, registrationID, hash))
	mock.ExpectQuery("SELECT reference_id, amount_minor, currency, status, provider").
		WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"reference_id", "amount_minor", "currency", "status", "provider"}).
			AddRow(registrationID, int64(2500), "BRL", refundedStatus, "TEST"))
	mock.ExpectQuery("SELECT EXISTS").
		WithArgs(paymentMessageID, paymentConfirmedEvent, chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectCommit()
	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err != nil {
		t.Fatalf("process duplicate completed refund: %v", err)
	}
	if provider.refundCalls != 1 {
		t.Fatalf("duplicate refund called provider again %d times", provider.refundCalls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRefundProviderFailureIsPersistedAndSameRequestCanRetry(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRefundRequested([]byte(validRefundEnvelopeJSON))
	hash, _ := hashRefundRequest(incoming)
	request := incoming.Request
	chargeID := request.ChargeID
	registrationID := request.RegistrationID
	provider := &recordingProvider{refundErr: errors.New("temporary provider outage")}
	store := NewStore(db, provider)
	store.now = func() time.Time { return time.Date(2026, 11, 16, 15, 16, 0, 0, time.UTC) }

	expectRefundStart(mock, t, incoming, hash, paidStatus, 3, true)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM charge_projections").WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(refundPendingStatus))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(int64(4)))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), chargeID, int64(4), RefundFailedEventType,
			jsonWithFields(t, map[string]any{"failureCode": "PROVIDER_ERROR",
				"failureDetail": "temporary provider outage"}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = \$3`).
		WithArgs(chargeID, refundFailedStatus, "temporary provider outage").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), RefundFailedEventType, chargeID,
			jsonWithFields(t, map[string]any{"chargeId": chargeID, "registrationId": registrationID,
				"failureCode": "PROVIDER_ERROR"}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err == nil {
		t.Fatal("expected provider failure to remain retryable")
	}
	if provider.refundCalls != 1 {
		t.Fatalf("expected one failed provider attempt, got %d", provider.refundCalls)
	}

	provider.refundErr = nil
	expectRefundStart(mock, t, incoming, hash, refundFailedStatus, 5, true)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM charge_projections").WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(refundPendingStatus))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).WithArgs(chargeID).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(int64(6)))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), chargeID, int64(6), RefundSucceededEventType,
			jsonWithFields(t, map[string]any{"amountMinor": float64(2500), "currency": "BRL"}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err != nil {
		t.Fatalf("retry same refund request: %v", err)
	}
	if provider.refundCalls != 2 || provider.refundIdempotencyKey != RefundIdempotencyPrefix+chargeID {
		t.Fatalf("retry did not retain stable provider idempotency: calls=%d key=%q",
			provider.refundCalls, provider.refundIdempotencyKey)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestRefundOutboxFailureRollsBackAndRetryUsesProviderIdempotencyKey(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer func() { _ = db.Close() }()

	incoming, _ := DecodeRefundRequested([]byte(validRefundEnvelopeJSON))
	hash, _ := hashRefundRequest(incoming)
	request := incoming.Request
	provider := &recordingProvider{refundResult: ProviderRefund{
		Reference:  "test-refund-" + RefundIdempotencyPrefix + request.ChargeID,
		RefundedAt: time.Date(2026, 11, 16, 15, 16, 0, 0, time.UTC),
	}}
	store := NewStore(db, provider)
	store.now = func() time.Time { return time.Date(2026, 11, 16, 15, 16, 0, 0, time.UTC) }

	expectRefundStart(mock, t, incoming, hash, paidStatus, 3, true)
	mock.ExpectBegin()
	expectRefundSuccessPersistence(mock, t, incoming, provider.refundResult, 4, true)
	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err == nil {
		t.Fatal("expected Outbox failure to remain retryable")
	}

	// The provider may already have returned success. On redelivery the same
	// stable idempotency key recovers that receipt and the persistence commits.
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID, request.ChargeID, request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT charge_id, registration_id, message_hash FROM processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id", "registration_id", "message_hash"}).
			AddRow(request.ChargeID, request.RegistrationID, hash))
	mock.ExpectQuery("SELECT reference_id, amount_minor, currency, status, provider").
		WithArgs(request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"reference_id", "amount_minor", "currency", "status", "provider"}).
			AddRow(request.RegistrationID, int64(2500), "BRL", refundPendingStatus, "TEST"))
	mock.ExpectQuery("SELECT EXISTS").
		WithArgs(request.PaymentMessageID, paymentConfirmedEvent, request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectCommit()
	mock.ExpectBegin()
	expectRefundSuccessPersistence(mock, t, incoming, provider.refundResult, 4, false)

	if err := store.ProcessRefund(context.Background(), []byte(validRefundEnvelopeJSON)); err != nil {
		t.Fatalf("retry refund after Outbox failure: %v", err)
	}
	if provider.refundCalls != 2 || provider.refundIdempotencyKey != RefundIdempotencyPrefix+request.ChargeID {
		t.Fatalf("retry did not use the same provider idempotency key: calls=%d key=%q",
			provider.refundCalls, provider.refundIdempotencyKey)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func expectRefundSuccessPersistence(mock sqlmock.Sqlmock, t *testing.T, incoming IncomingRefundRequest,
	result ProviderRefund, version int64, failOutbox bool) {
	request := incoming.Request
	mock.ExpectQuery("SELECT status FROM charge_projections").WithArgs(request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(refundPendingStatus))
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).WithArgs(request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(version))
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), request.ChargeID, version, RefundSucceededEventType,
			jsonWithFields(t, map[string]any{"providerRefundReference": result.Reference,
				"amountMinor": float64(2500), "currency": "BRL"}), result.RefundedAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE charge_projections").
		WithArgs(request.ChargeID, refundedStatus, result.RefundedAt, result.Reference).
		WillReturnResult(sqlmock.NewResult(0, 1))
	outbox := mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), RefundSucceededEventType, request.ChargeID, sqlmock.AnyArg(), result.RefundedAt)
	if failOutbox {
		outbox.WillReturnError(errors.New("database write failed"))
		mock.ExpectRollback()
		return
	}
	outbox.WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
}

func expectRefundStart(mock sqlmock.Sqlmock, t *testing.T, incoming IncomingRefundRequest, hash, status string,
	nextVersion int64, firstMessage bool) {
	t.Helper()
	request := incoming.Request
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO processed_refund_requests").
		WithArgs(incoming.Envelope.MessageID, request.ChargeID, request.RegistrationID, hash, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT reference_id, amount_minor, currency, status, provider").WithArgs(request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"reference_id", "amount_minor", "currency", "status", "provider"}).
			AddRow(request.RegistrationID, int64(2500), "BRL", status, "TEST"))
	mock.ExpectQuery("SELECT EXISTS").
		WithArgs(request.PaymentMessageID, paymentConfirmedEvent, request.ChargeID).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	if firstMessage {
		mock.ExpectQuery(`SELECT COALESCE\(MAX\(aggregate_version\), 0\) \+ 1`).WithArgs(request.ChargeID).
			WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(nextVersion))
		mock.ExpectExec("INSERT INTO payment_events").
			WithArgs(sqlmock.AnyArg(), request.ChargeID, nextVersion, RefundRequestedEventType,
				jsonWithFields(t, map[string]any{"idempotencyKey": RefundIdempotencyPrefix + request.ChargeID,
					"amountMinor": float64(2500), "currency": "BRL"}), sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`UPDATE charge_projections SET status = \$2, refund_error = NULL`).
			WithArgs(request.ChargeID, refundPendingStatus).WillReturnResult(sqlmock.NewResult(0, 1))
	}
	mock.ExpectCommit()
}

type recordingProvider struct {
	idempotencyKey       string
	calls                int
	refundIdempotencyKey string
	refundCalls          int
	refundErr            error
	refundResult         ProviderRefund
	refundRequest        ProviderRefundRequest
}

func (*recordingProvider) Name() string { return "TEST" }

func (p *recordingProvider) CreateCharge(_ context.Context, idempotencyKey string,
	request RegistrationPaymentRequest) (ProviderCharge, error) {
	p.idempotencyKey = idempotencyKey
	p.calls++
	return ProviderCharge{Reference: "test-" + idempotencyKey}, nil
}

func (p *recordingProvider) Refund(_ context.Context, idempotencyKey string,
	request ProviderRefundRequest) (ProviderRefund, error) {
	p.refundIdempotencyKey = idempotencyKey
	p.refundRequest = request
	p.refundCalls++
	if p.refundErr != nil {
		return ProviderRefund{}, p.refundErr
	}
	if p.refundResult.Reference == "" {
		p.refundResult = ProviderRefund{
			Reference:  "test-refund-" + idempotencyKey,
			RefundedAt: time.Date(2026, 11, 16, 15, 16, 0, 0, time.UTC),
		}
	}
	return p.refundResult, nil
}

type jsonArgument struct {
	t      *testing.T
	fields map[string]any
}

func (m jsonArgument) Match(value driver.Value) bool {
	var encoded []byte
	switch typed := value.(type) {
	case string:
		encoded = []byte(typed)
	case []byte:
		encoded = typed
	default:
		return false
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		m.t.Errorf("decode JSON query argument: %v", err)
		return false
	}
	for key, want := range m.fields {
		if nested, ok := want.(map[string]any); ok {
			actual, ok := decoded[key].(map[string]any)
			if !ok {
				return false
			}
			for nestedKey, nestedValue := range nested {
				if actual[nestedKey] != nestedValue {
					return false
				}
			}
			continue
		}
		if decoded[key] != want {
			return false
		}
	}
	return true
}

func jsonWithFields(t *testing.T, fields map[string]any) sqlmock.Argument {
	t.Helper()
	return jsonArgument{t: t, fields: fields}
}

func expectActiveRegistrationGate(mock sqlmock.Sqlmock, registrationID string) {
	mock.ExpectExec("INSERT INTO payment_registration_gates").
		WithArgs(registrationID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT cancelled FROM payment_registration_gates").
		WithArgs(registrationID).
		WillReturnRows(sqlmock.NewRows([]string{"cancelled"}).AddRow(false))
}

func replaceOnce(value, old, replacement string) string {
	return strings.Replace(value, old, replacement, 1)
}
