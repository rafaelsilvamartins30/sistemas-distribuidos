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
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO payment_events").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), chargeCreatedEvent,
			jsonWithFields(t, map[string]any{"status": pendingStatus, "provider": "SIMULATED"}), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO charge_projections").
		WithArgs(sqlmock.AnyArg(), RegistrationReferenceType, incoming.Request.RegistrationID,
			incoming.Request.UserID, int64(2500), "BRL", pendingStatus, "SIMULATED", sqlmock.AnyArg(),
			sqlmock.AnyArg(), "", sqlmock.AnyArg(), incoming.Request.PaymentDeadlineAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO payment_outbox").
		WithArgs(sqlmock.AnyArg(), chargeCreatedEvent, sqlmock.AnyArg(),
			jsonWithFields(t, map[string]any{"status": pendingStatus, "request": map[string]any{"amountMinor": float64(2500)}}),
			sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	store := NewStore(db, SimulatedPixProvider{})
	if err := store.Process(context.Background(), []byte(validEnvelopeJSON)); err != nil {
		t.Fatalf("process charge request: %v", err)
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
	mock.ExpectQuery("SELECT charge_id FROM charge_projections").
		WithArgs(RegistrationReferenceType, incoming.Request.RegistrationID).
		WillReturnRows(sqlmock.NewRows([]string{"charge_id"}).AddRow(existingEvent.ChargeID))
	mock.ExpectQuery("SELECT payload_json FROM payment_events").
		WithArgs(existingEvent.ChargeID, chargeCreatedEvent).
		WillReturnRows(sqlmock.NewRows([]string{"payload_json"}).AddRow(eventJSON))
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

func replaceOnce(value, old, replacement string) string {
	return strings.Replace(value, old, replacement, 1)
}
