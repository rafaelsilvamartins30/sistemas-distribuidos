package main

import (
	"testing"

	"br.unir/payment/internal/payment"
)

func TestSimulatedConfirmationIsEnabledOnlyForLocalOrTest(t *testing.T) {
	store := payment.NewStore(nil, payment.SimulatedPixProvider{})
	t.Setenv("PAYMENT_ENV", "production")
	t.Setenv("PAYMENT_SIMULATED_CONFIRMATION_ENABLED", "true")
	if confirmer := simulatedConfirmer(store); confirmer != nil {
		t.Fatal("simulated confirmation must not be exposed in production")
	}

	t.Setenv("PAYMENT_ENV", "local")
	t.Setenv("PAYMENT_SIMULATED_CONFIRMATION_ENABLED", "false")
	if confirmer := simulatedConfirmer(store); confirmer != nil {
		t.Fatal("simulated confirmation must remain opt-in")
	}

	t.Setenv("PAYMENT_SIMULATED_CONFIRMATION_ENABLED", "true")
	if confirmer := simulatedConfirmer(store); confirmer != store {
		t.Fatal("expected local environment to expose explicitly enabled simulation")
	}
}
