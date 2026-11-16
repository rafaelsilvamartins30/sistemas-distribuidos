package payment

import (
	"errors"
	"strings"
	"testing"
)

const validEnvelopeJSON = `{
	"messageId":"550e8400-e29b-41d4-a716-446655440001",
	"eventType":"RegistrationPaymentRequested",
	"aggregateType":"Registration",
	"aggregateId":"550e8400-e29b-41d4-a716-446655440002",
	"occurredAt":"2026-11-16T15:00:00Z",
	"schemaVersion":1,
	"payloadJson":{
		"registrationId":"550e8400-e29b-41d4-a716-446655440002",
		"eventId":"550e8400-e29b-41d4-a716-446655440003",
		"userId":"keycloak-subject-123",
		"amountMinor":2500,
		"currency":"BRL",
		"paymentDeadlineAt":"2026-11-16T15:10:00Z",
		"reservationExpiresAt":"2026-11-16T15:15:00Z"
	}
}`

const validRefundEnvelopeJSON = `{
	"messageId":"744019a0-f221-4fb5-8e41-ccba14af00d1",
	"eventType":"RefundRequested",
	"aggregateType":"Charge",
	"aggregateId":"937994f7-3bf7-55b3-8b2d-fd6b247787f4",
	"occurredAt":"2026-11-16T15:15:01Z",
	"schemaVersion":1,
	"payloadJson":{
		"chargeId":"937994f7-3bf7-55b3-8b2d-fd6b247787f4",
		"registrationId":"8e871c70-cf63-45eb-a80a-a71a7098f1ed",
		"paymentMessageId":"2b4869bb-6466-4f3e-97bf-a060bde93ea0",
		"reason":"RESERVATION_EXPIRED"
	}
}`

const validRegistrationCancelledByEventEnvelopeJSON = `{
	"messageId":"cf63b6b3-6d0f-4a3f-b58a-7334f4aa39dd",
	"eventType":"RegistrationCancelledByEvent",
	"aggregateType":"Registration",
	"aggregateId":"8e871c70-cf63-45eb-a80a-a71a7098f1ed",
	"occurredAt":"2026-11-16T15:15:01Z",
	"schemaVersion":1,
	"payloadJson":{
		"registrationId":"8e871c70-cf63-45eb-a80a-a71a7098f1ed",
		"eventId":"86f552a1-2979-4ce0-a816-8e8f2dc3d2d1",
		"userId":"keycloak-subject-123",
		"cancelledAt":"2026-11-16T15:15:01Z"
	}
}`

func TestDecodeRegistrationPaymentV1KeepsAmountInCentsAndKeycloakSubject(t *testing.T) {
	incoming, err := DecodeRegistrationPayment([]byte(validEnvelopeJSON))
	if err != nil {
		t.Fatalf("decode valid request: %v", err)
	}
	if incoming.Request.AmountMinor != 2500 {
		t.Fatalf("expected 2500 cents, got %d", incoming.Request.AmountMinor)
	}
	if incoming.Request.UserID != "keycloak-subject-123" {
		t.Fatalf("unexpected userId: %q", incoming.Request.UserID)
	}
	if incoming.Request.Currency != "BRL" {
		t.Fatalf("unexpected currency: %q", incoming.Request.Currency)
	}
}

func TestDecodeRegistrationPaymentRejectsInvalidEnvelopeAndPayloadValues(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "wrong event type", body: strings.Replace(validEnvelopeJSON, RegistrationPaymentRequested, "ChargeCreated", 1)},
		{name: "unsupported schema", body: strings.Replace(validEnvelopeJSON, `"schemaVersion":1`, `"schemaVersion":2`, 1)},
		{name: "aggregate does not match registration", body: strings.Replace(validEnvelopeJSON,
			`"aggregateId":"550e8400-e29b-41d4-a716-446655440002"`,
			`"aggregateId":"550e8400-e29b-41d4-a716-446655440004"`, 1)},
		{name: "decimal amount is not accepted", body: strings.Replace(validEnvelopeJSON, `"amountMinor":2500`, `"amountMinor":25.00`, 1)},
		{name: "amount must be positive", body: strings.Replace(validEnvelopeJSON, `"amountMinor":2500`, `"amountMinor":0`, 1)},
		{name: "currency must be BRL", body: strings.Replace(validEnvelopeJSON, `"currency":"BRL"`, `"currency":"USD"`, 1)},
		{name: "subject is required", body: strings.Replace(validEnvelopeJSON, `"userId":"keycloak-subject-123"`, `"userId":"  "`, 1)},
		{name: "reservation must outlive payment deadline", body: strings.Replace(validEnvelopeJSON,
			`"reservationExpiresAt":"2026-11-16T15:15:00Z"`,
			`"reservationExpiresAt":"2026-11-16T15:05:00Z"`, 1)},
		{name: "unknown payload field", body: strings.Replace(validEnvelopeJSON,
			`"amountMinor":2500`, `"amountMinor":2500,"newAmount":2500`, 1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := DecodeRegistrationPayment([]byte(test.body))
			if !errors.Is(err, ErrInvalidMessage) {
				t.Fatalf("expected ErrInvalidMessage, got %v", err)
			}
		})
	}
}

func TestDecodeRefundRequestedV1UsesChargeReferenceWithoutAmount(t *testing.T) {
	incoming, err := DecodeRefundRequested([]byte(validRefundEnvelopeJSON))
	if err != nil {
		t.Fatalf("decode valid refund request: %v", err)
	}
	if incoming.Request.ChargeID != incoming.Envelope.AggregateID || incoming.Request.Reason != "RESERVATION_EXPIRED" {
		t.Fatalf("unexpected refund request: %+v", incoming.Request)
	}
}

func TestDecodeRefundRequestedRejectsInvalidReferencesAndValues(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "wrong event type", body: strings.Replace(validRefundEnvelopeJSON, RefundRequestedEventType, "PaymentConfirmed", 1)},
		{name: "aggregate mismatch", body: strings.Replace(validRefundEnvelopeJSON,
			`"aggregateId":"937994f7-3bf7-55b3-8b2d-fd6b247787f4"`,
			`"aggregateId":"937994f7-3bf7-55b3-8b2d-fd6b247787f5"`, 1)},
		{name: "invalid reason", body: strings.Replace(validRefundEnvelopeJSON, "RESERVATION_EXPIRED", "late refund", 1)},
		{name: "missing source confirmation", body: strings.Replace(validRefundEnvelopeJSON,
			`"paymentMessageId":"2b4869bb-6466-4f3e-97bf-a060bde93ea0"`,
			`"paymentMessageId":"not-a-uuid"`, 1)},
		{name: "unknown payload value", body: strings.Replace(validRefundEnvelopeJSON,
			`"reason":"RESERVATION_EXPIRED"`, `"reason":"RESERVATION_EXPIRED","amountMinor":2500`, 1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := DecodeRefundRequested([]byte(test.body)); !errors.Is(err, ErrInvalidMessage) {
				t.Fatalf("expected invalid integration message, got %v", err)
			}
		})
	}
}

func TestDecodeRegistrationCancelledByEventV1(t *testing.T) {
	incoming, err := DecodeRegistrationCancelledByEvent([]byte(validRegistrationCancelledByEventEnvelopeJSON))
	if err != nil {
		t.Fatalf("decode valid cancellation: %v", err)
	}
	if incoming.Payload.UserID != "keycloak-subject-123" ||
		incoming.Envelope.AggregateID != incoming.Payload.RegistrationID {
		t.Fatalf("unexpected cancellation contract: %+v", incoming)
	}
}

func TestDecodeRegistrationCancelledByEventRejectsInvalidContract(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "wrong route event type", body: strings.Replace(validRegistrationCancelledByEventEnvelopeJSON,
			RegistrationCancelledByEventEventType, "EventCancelled", 1)},
		{name: "aggregate mismatch", body: strings.Replace(validRegistrationCancelledByEventEnvelopeJSON,
			`"aggregateId":"8e871c70-cf63-45eb-a80a-a71a7098f1ed"`,
			`"aggregateId":"8e871c70-cf63-45eb-a80a-a71a7098f1ee"`, 1)},
		{name: "empty subject", body: strings.Replace(validRegistrationCancelledByEventEnvelopeJSON,
			`"userId":"keycloak-subject-123"`, `"userId":"  "`, 1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := DecodeRegistrationCancelledByEvent([]byte(test.body)); !errors.Is(err, ErrInvalidMessage) {
				t.Fatalf("expected invalid integration message, got %v", err)
			}
		})
	}
}
