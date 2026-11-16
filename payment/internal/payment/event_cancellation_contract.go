package payment

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

const (
	RegistrationCancelledByEventEventType = "RegistrationCancelledByEvent"
	RegistrationCancelledByEventQueue     = "payment.registration-cancelled"
	RegistrationCancelledByEventRoute     = "engagement.registration.cancelled-by-event.v1"
	chargeCancelledEvent                  = "ChargeCancelled"
)

type RegistrationCancelledByEventPayload struct {
	RegistrationID string    `json:"registrationId"`
	EventID        string    `json:"eventId"`
	UserID         string    `json:"userId"`
	CancelledAt    time.Time `json:"cancelledAt"`
}

type IncomingRegistrationCancellation struct {
	Envelope IntegrationEnvelope
	Payload  RegistrationCancelledByEventPayload
}

func DecodeRegistrationCancelledByEvent(body []byte) (IncomingRegistrationCancellation, error) {
	var envelope IntegrationEnvelope
	if err := decodeStrict(body, &envelope); err != nil {
		return IncomingRegistrationCancellation{}, invalidCancellationMessage("invalid envelope JSON", err)
	}
	if !uuidPattern.MatchString(envelope.MessageID) || envelope.EventType != RegistrationCancelledByEventEventType ||
		envelope.AggregateType != RegistrationAggregateType || !uuidPattern.MatchString(envelope.AggregateID) ||
		envelope.OccurredAt.IsZero() || envelope.SchemaVersion != SupportedSchemaVersion ||
		len(envelope.PayloadJSON) == 0 || bytes.Equal(bytes.TrimSpace(envelope.PayloadJSON), []byte("null")) {
		return IncomingRegistrationCancellation{}, invalidCancellationMessage("invalid v1 envelope", nil)
	}
	var payload RegistrationCancelledByEventPayload
	if err := decodeStrict(envelope.PayloadJSON, &payload); err != nil {
		return IncomingRegistrationCancellation{}, invalidCancellationMessage("invalid payload", err)
	}
	if !uuidPattern.MatchString(payload.RegistrationID) || !uuidPattern.MatchString(payload.EventID) ||
		!strings.EqualFold(envelope.AggregateID, payload.RegistrationID) || strings.TrimSpace(payload.UserID) == "" ||
		len(payload.UserID) > 255 || payload.CancelledAt.IsZero() {
		return IncomingRegistrationCancellation{}, invalidCancellationMessage("inconsistent or missing payload fields", nil)
	}
	envelope.MessageID = strings.ToLower(envelope.MessageID)
	envelope.AggregateID = strings.ToLower(envelope.AggregateID)
	envelope.OccurredAt = envelope.OccurredAt.UTC()
	payload.RegistrationID = strings.ToLower(payload.RegistrationID)
	payload.EventID = strings.ToLower(payload.EventID)
	payload.CancelledAt = payload.CancelledAt.UTC()
	return IncomingRegistrationCancellation{Envelope: envelope, Payload: payload}, nil
}

func hashRegistrationCancellation(incoming IncomingRegistrationCancellation) (string, error) {
	canonicalPayload, err := json.Marshal(incoming.Payload)
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

func invalidCancellationMessage(message string, cause error) error {
	if cause == nil {
		return invalidMessage("invalid RegistrationCancelledByEvent v1 message: "+message, nil)
	}
	return invalidMessage("invalid RegistrationCancelledByEvent v1 message: "+message, cause)
}
