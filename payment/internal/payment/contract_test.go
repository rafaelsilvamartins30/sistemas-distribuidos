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
