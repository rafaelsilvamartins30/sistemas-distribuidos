package payment

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
)

const (
	RegistrationPaymentRequested = "RegistrationPaymentRequested"
	RegistrationAggregateType    = "Registration"
	RegistrationReferenceType    = "REGISTRATION"
	SupportedSchemaVersion       = 1
)

var (
	ErrInvalidMessage = errors.New("invalid RegistrationPaymentRequested v1 message")
	uuidPattern       = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// IntegrationEnvelope is the shared envelope published by Engagement.
type IntegrationEnvelope struct {
	MessageID     string          `json:"messageId"`
	EventType     string          `json:"eventType"`
	AggregateType string          `json:"aggregateType"`
	AggregateID   string          `json:"aggregateId"`
	OccurredAt    time.Time       `json:"occurredAt"`
	SchemaVersion int             `json:"schemaVersion"`
	PayloadJSON   json.RawMessage `json:"payloadJson"`
}

// RegistrationPaymentRequest is the v1 payload. AmountMinor is already in cents.
type RegistrationPaymentRequest struct {
	RegistrationID       string    `json:"registrationId"`
	EventID              string    `json:"eventId"`
	UserID               string    `json:"userId"`
	AmountMinor          int64     `json:"amountMinor"`
	Currency             string    `json:"currency"`
	PaymentDeadlineAt    time.Time `json:"paymentDeadlineAt"`
	ReservationExpiresAt time.Time `json:"reservationExpiresAt"`
}

// IncomingRegistrationPayment contains a validated envelope and payload.
type IncomingRegistrationPayment struct {
	Envelope IntegrationEnvelope
	Request  RegistrationPaymentRequest
}

func DecodeRegistrationPayment(body []byte) (IncomingRegistrationPayment, error) {
	var envelope IntegrationEnvelope
	if err := decodeStrict(body, &envelope); err != nil {
		return IncomingRegistrationPayment{}, invalidMessage("invalid envelope JSON", err)
	}
	if !uuidPattern.MatchString(envelope.MessageID) {
		return IncomingRegistrationPayment{}, invalidMessage("messageId must be a UUID", nil)
	}
	if envelope.EventType != RegistrationPaymentRequested {
		return IncomingRegistrationPayment{}, invalidMessage("unsupported eventType", nil)
	}
	if envelope.AggregateType != RegistrationAggregateType {
		return IncomingRegistrationPayment{}, invalidMessage("aggregateType must be Registration", nil)
	}
	if !uuidPattern.MatchString(envelope.AggregateID) {
		return IncomingRegistrationPayment{}, invalidMessage("aggregateId must be a UUID", nil)
	}
	if envelope.OccurredAt.IsZero() || envelope.SchemaVersion != SupportedSchemaVersion {
		return IncomingRegistrationPayment{}, invalidMessage("occurredAt and schemaVersion 1 are required", nil)
	}
	if len(envelope.PayloadJSON) == 0 || bytes.Equal(bytes.TrimSpace(envelope.PayloadJSON), []byte("null")) {
		return IncomingRegistrationPayment{}, invalidMessage("payloadJson is required", nil)
	}

	var request RegistrationPaymentRequest
	if err := decodeStrict(envelope.PayloadJSON, &request); err != nil {
		return IncomingRegistrationPayment{}, invalidMessage("invalid payloadJson", err)
	}
	if !uuidPattern.MatchString(request.RegistrationID) || !uuidPattern.MatchString(request.EventID) {
		return IncomingRegistrationPayment{}, invalidMessage("registrationId and eventId must be UUIDs", nil)
	}
	if !strings.EqualFold(envelope.AggregateID, request.RegistrationID) {
		return IncomingRegistrationPayment{}, invalidMessage("aggregateId must match registrationId", nil)
	}
	if strings.TrimSpace(request.UserID) == "" {
		return IncomingRegistrationPayment{}, invalidMessage("userId must contain the Keycloak subject", nil)
	}
	if request.AmountMinor <= 0 {
		return IncomingRegistrationPayment{}, invalidMessage("amountMinor must be positive cents", nil)
	}
	if request.Currency != "BRL" {
		return IncomingRegistrationPayment{}, invalidMessage("currency must be BRL", nil)
	}
	if request.PaymentDeadlineAt.IsZero() || request.ReservationExpiresAt.IsZero() ||
		!request.ReservationExpiresAt.After(request.PaymentDeadlineAt) {
		return IncomingRegistrationPayment{}, invalidMessage("payment and reservation deadlines are invalid", nil)
	}

	envelope.OccurredAt = envelope.OccurredAt.UTC()
	request.PaymentDeadlineAt = request.PaymentDeadlineAt.UTC()
	request.ReservationExpiresAt = request.ReservationExpiresAt.UTC()
	envelope.MessageID = strings.ToLower(envelope.MessageID)
	envelope.AggregateID = strings.ToLower(envelope.AggregateID)
	request.RegistrationID = strings.ToLower(request.RegistrationID)
	request.EventID = strings.ToLower(request.EventID)
	return IncomingRegistrationPayment{Envelope: envelope, Request: request}, nil
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

func invalidMessage(message string, cause error) error {
	if cause == nil {
		return fmt.Errorf("%w: %s", ErrInvalidMessage, message)
	}
	return fmt.Errorf("%w: %s: %v", ErrInvalidMessage, message, cause)
}
