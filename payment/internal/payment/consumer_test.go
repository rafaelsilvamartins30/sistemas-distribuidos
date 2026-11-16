package payment

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type testProcessor struct {
	err       error
	processed bool
	wasAcked  func() bool
}

func (p *testProcessor) Process(_ context.Context, _ []byte) error {
	p.processed = true
	if p.wasAcked != nil && p.wasAcked() {
		return errors.New("message was acknowledged before persistence")
	}
	return p.err
}

type testAcknowledger struct {
	acked   bool
	nacked  bool
	requeue bool
}

func (a *testAcknowledger) Ack(_ uint64, _ bool) error {
	a.acked = true
	return nil
}

func (a *testAcknowledger) Nack(_ uint64, _ bool, requeue bool) error {
	a.nacked = true
	a.requeue = requeue
	return nil
}

func (*testAcknowledger) Reject(_ uint64, _ bool) error { return nil }

func TestConsumerAcknowledgesOnlyAfterProcessorReturnsSuccessfully(t *testing.T) {
	acknowledger := &testAcknowledger{}
	processor := &testProcessor{wasAcked: func() bool { return acknowledger.acked }}
	consumer := testConsumer(processor)
	delivery := amqp.Delivery{Acknowledger: acknowledger, DeliveryTag: 1, Body: []byte("message")}

	if err := consumer.handleDelivery(context.Background(), delivery); err != nil {
		t.Fatalf("handle successful delivery: %v", err)
	}
	if !processor.processed || !acknowledger.acked || acknowledger.nacked {
		t.Fatalf("expected persisted message to be acknowledged: processor=%v ack=%v nack=%v",
			processor.processed, acknowledger.acked, acknowledger.nacked)
	}
}

func TestConsumerRejectsPermanentInvalidMessageWithoutRequeue(t *testing.T) {
	acknowledger := &testAcknowledger{}
	consumer := testConsumer(&testProcessor{err: ErrInvalidMessage})
	delivery := amqp.Delivery{Acknowledger: acknowledger, DeliveryTag: 2, Body: []byte("invalid")}

	if err := consumer.handleDelivery(context.Background(), delivery); err != nil {
		t.Fatalf("handle invalid delivery: %v", err)
	}
	if acknowledger.acked || !acknowledger.nacked || acknowledger.requeue {
		t.Fatalf("expected invalid message rejection without requeue: %+v", acknowledger)
	}
}

func TestConsumerRequeuesTemporaryDatabaseFailure(t *testing.T) {
	acknowledger := &testAcknowledger{}
	consumer := testConsumer(&testProcessor{err: errors.New("database unavailable")})
	consumer.retryDelay = 0
	delivery := amqp.Delivery{Acknowledger: acknowledger, DeliveryTag: 3, Body: []byte("valid")}

	if err := consumer.handleDelivery(context.Background(), delivery); err != nil {
		t.Fatalf("handle temporary failure: %v", err)
	}
	if acknowledger.acked || !acknowledger.nacked || !acknowledger.requeue {
		t.Fatalf("expected temporary failure to be requeued: %+v", acknowledger)
	}
}

func testConsumer(processor MessageProcessor) *Consumer {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	consumer := NewConsumer("amqp://guest:guest@localhost:5672/", processor, logger)
	consumer.retryDelay = time.Nanosecond
	return consumer
}
