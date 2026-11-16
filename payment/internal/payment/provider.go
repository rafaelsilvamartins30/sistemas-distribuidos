package payment

import (
	"context"
	"fmt"
)

// PixProvider creates a Pix charge without confirming or settling it.
type PixProvider interface {
	Name() string
	CreateCharge(context.Context, string, RegistrationPaymentRequest) (ProviderCharge, error)
}

// ProviderCharge contains data returned by the selected Pix provider.
type ProviderCharge struct {
	Reference    string
	PixCopyPaste string
	QRCodeURL    string
}

// SimulatedPixProvider creates clearly fake data and never moves money.
type SimulatedPixProvider struct{}

func (SimulatedPixProvider) Name() string {
	return "SIMULATED"
}

func (SimulatedPixProvider) CreateCharge(_ context.Context, chargeID string,
	request RegistrationPaymentRequest) (ProviderCharge, error) {
	return ProviderCharge{
		Reference:    "simulated-" + chargeID,
		PixCopyPaste: fmt.Sprintf("SIMULATED-PIX:BRL:%d:%s", request.AmountMinor, request.RegistrationID),
		QRCodeURL:    "",
	}, nil
}
