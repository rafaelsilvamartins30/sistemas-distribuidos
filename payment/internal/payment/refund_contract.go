package payment

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

const (
	RefundRequestedEventType = "RefundRequested"
	RefundSucceededEventType = "RefundSucceeded"
	RefundFailedEventType    = "RefundFailed"
	RefundRequestQueue       = "payment.refund-requests"
	RefundRequestedRoute     = "engagement.payment.refund-requested.v1"
	RefundSucceededRoute     = "payment.refund.succeeded.v1"
	RefundFailedRoute        = "payment.refund.failed.v1"
	RefundAggregateType      = "Charge"
	RefundIdempotencyPrefix  = "unir-full-refund:"
)

// RefundRequestedPayload references the already captured charge. Payment
// reads the immutable amount and currency from its own projection.
type RefundRequestedPayload struct {
	ChargeID         string `json:"chargeId"`
	RegistrationID   string `json:"registrationId"`
	PaymentMessageID string `json:"paymentMessageId"`
	Reason           string `json:"reason"`
}

type IncomingRefundRequest struct {
	Envelope IntegrationEnvelope
	Request  RefundRequestedPayload
}

func DecodeRefundRequested(body []byte) (IncomingRefundRequest, error) {
	var envelope IntegrationEnvelope
	if err := decodeStrict(body, &envelope); err != nil {
		return IncomingRefundRequest{}, invalidRefundMessage("invalid envelope JSON", err)
	}
	if !uuidPattern.MatchString(envelope.MessageID) || envelope.EventType != RefundRequestedEventType ||
		envelope.AggregateType != RefundAggregateType || !uuidPattern.MatchString(envelope.AggregateID) ||
		envelope.OccurredAt.IsZero() || envelope.SchemaVersion != SupportedSchemaVersion ||
		len(envelope.PayloadJSON) == 0 || bytes.Equal(bytes.TrimSpace(envelope.PayloadJSON), []byte("null")) {
		return IncomingRefundRequest{}, invalidRefundMessage("invalid RefundRequested v1 envelope", nil)
	}

	var request RefundRequestedPayload
	if err := decodeStrict(envelope.PayloadJSON, &request); err != nil {
		return IncomingRefundRequest{}, invalidRefundMessage("invalid RefundRequested payload", err)
	}
	if !uuidPattern.MatchString(request.ChargeID) || !uuidPattern.MatchString(request.RegistrationID) ||
		!uuidPattern.MatchString(request.PaymentMessageID) ||
		!strings.EqualFold(envelope.AggregateID, request.ChargeID) ||
		!validRefundReason(request.Reason) {
		return IncomingRefundRequest{}, invalidRefundMessage("invalid RefundRequested identifiers or reason", nil)
	}

	envelope.MessageID = strings.ToLower(envelope.MessageID)
	envelope.AggregateID = strings.ToLower(envelope.AggregateID)
	envelope.OccurredAt = envelope.OccurredAt.UTC()
	request.ChargeID = strings.ToLower(request.ChargeID)
	request.RegistrationID = strings.ToLower(request.RegistrationID)
	request.PaymentMessageID = strings.ToLower(request.PaymentMessageID)
	return IncomingRefundRequest{Envelope: envelope, Request: request}, nil
}

func validRefundReason(reason string) bool {
	if reason == "" || len(reason) > 64 {
		return false
	}
	for _, character := range reason {
		if (character < 'A' || character > 'Z') && (character < '0' || character > '9') && character != '_' {
			return false
		}
	}
	return true
}

func hashRefundRequest(incoming IncomingRefundRequest) (string, error) {
	canonicalPayload, err := json.Marshal(incoming.Request)
	if err != nil {
		return "", err
	}
	incoming.Envelope.PayloadJSON = canonicalPayload
	canonicalEnvelope, err := json.Marshal(incoming.Envelope)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(canonicalEnvelope)
	return hex.EncodeToString(hash[:]), nil
}

func invalidRefundMessage(message string, cause error) error {
	if cause == nil {
		return invalidMessage("invalid RefundRequested v1 message: "+message, nil)
	}
	return invalidMessage("invalid RefundRequested v1 message: "+message, cause)
}
