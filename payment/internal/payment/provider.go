package payment

import (
	"context"
	"fmt"
	"time"
)

// PixProvider creates a Pix charge without confirming or settling it. The
// idempotency key is stable for a registration across broker retries.
type PixProvider interface {
	Name() string
	CreateCharge(context.Context, string, RegistrationPaymentRequest) (ProviderCharge, error)
	Refund(context.Context, string, ProviderRefundRequest) (ProviderRefund, error)
}

// ProviderCharge contains data returned by the selected Pix provider.
type ProviderCharge struct {
	Reference    string
	PixCopyPaste string
	QRCodeURL    string
}

type ProviderRefundRequest struct {
	ChargeID    string
	AmountMinor int64
	Currency    string
}

type ProviderRefund struct {
	Reference  string
	RefundedAt time.Time
}

// SimulatedPixProvider creates clearly fake data and never moves money.
type SimulatedPixProvider struct{}

func (SimulatedPixProvider) Name() string {
	return "SIMULATED"
}

func (SimulatedPixProvider) CreateCharge(_ context.Context, idempotencyKey string,
	request RegistrationPaymentRequest) (ProviderCharge, error) {
	return ProviderCharge{
		Reference:    "simulated-" + idempotencyKey,
		PixCopyPaste: fmt.Sprintf("SIMULATED-PIX:BRL:%d:%s", request.AmountMinor, request.RegistrationID),
		QRCodeURL:    "",
	}, nil
}

// Refund returns a deterministic simulated refund receipt and never moves money.
func (SimulatedPixProvider) Refund(_ context.Context, idempotencyKey string,
	request ProviderRefundRequest) (ProviderRefund, error) {
	return ProviderRefund{
		Reference:  "simulated-refund-" + idempotencyKey,
		RefundedAt: time.Now().UTC(),
	}, nil
}
