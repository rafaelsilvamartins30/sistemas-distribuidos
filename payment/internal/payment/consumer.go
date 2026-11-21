package payment

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const RegistrationPaymentQueue = "payment.registration-requests"

// MessageProcessor validates and persists one incoming integration event.
type MessageProcessor interface {
	Process(context.Context, []byte) error
}

// Consumer consumes RegistrationPaymentRequested deliveries with manual ACKs.
type Consumer struct {
	url        string
	queue      string
	process    func(context.Context, []byte) error
	logger     *slog.Logger
	retryDelay time.Duration
}

func NewConsumer(url string, processor MessageProcessor, logger *slog.Logger) *Consumer {
	if logger == nil {
		logger = slog.Default()
	}
	return newConsumer(url, RegistrationPaymentQueue, processor.Process, logger)
}

// RefundMessageProcessor consumes refund requests from Engagement.
type RefundMessageProcessor interface {
	ProcessRefund(context.Context, []byte) error
}

func NewRefundConsumer(url string, processor RefundMessageProcessor, logger *slog.Logger) *Consumer {
	if logger == nil {
		logger = slog.Default()
	}
	return newConsumer(url, RefundRequestQueue, processor.ProcessRefund, logger)
}

// RegistrationCancellationProcessor consumes cancellation decisions from Engagement.
type RegistrationCancellationProcessor interface {
	ProcessRegistrationCancelledByEvent(context.Context, []byte) error
}

func NewRegistrationCancellationConsumer(url string, processor RegistrationCancellationProcessor,
	logger *slog.Logger) *Consumer {
	if logger == nil {
		logger = slog.Default()
	}
	return newConsumer(url, RegistrationCancelledByEventQueue, processor.ProcessRegistrationCancelledByEvent, logger)
}

func newConsumer(url, queue string, process func(context.Context, []byte) error, logger *slog.Logger) *Consumer {
	return &Consumer{url: url, queue: queue, process: process, logger: logger, retryDelay: time.Second}
}

// Run keeps reconnecting when RabbitMQ is unavailable. It returns only after
// the application context is cancelled.
func (c *Consumer) Run(ctx context.Context) {
	delay := time.Second
	for ctx.Err() == nil {
		if err := c.consume(ctx); err != nil && ctx.Err() == nil {
			c.logger.Warn("Payment RabbitMQ consumer disconnected", "error", err)
		}
		if !waitContext(ctx, delay) {
			return
		}
		if delay < 30*time.Second {
			delay *= 2
		}
	}
}

func (c *Consumer) consume(ctx context.Context) error {
	connection, err := amqp.Dial(c.url)
	if err != nil {
		return fmt.Errorf("connect to RabbitMQ: %w", err)
	}
	defer func() { _ = connection.Close() }()

	channel, err := connection.Channel()
	if err != nil {
		return fmt.Errorf("open RabbitMQ channel: %w", err)
	}
	defer func() { _ = channel.Close() }()

	queue, err := channel.QueueDeclare(c.queue, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("declare Payment queue %s: %w", c.queue, err)
	}
	if err := channel.Qos(1, 0, false); err != nil {
		return fmt.Errorf("configure Payment consumer prefetch: %w", err)
	}
	deliveries, err := channel.ConsumeWithContext(ctx, queue.Name, c.queue+"-consumer", false,
		false, false, false, nil)
	if err != nil {
		return fmt.Errorf("subscribe to Payment request queue: %w", err)
	}
	c.logger.Info("Payment consumer listening", "queue", queue.Name)
	for {
		select {
		case <-ctx.Done():
			return nil
		case delivery, ok := <-deliveries:
			if !ok {
				return errors.New("RabbitMQ delivery channel closed")
			}
			if err := c.handleDelivery(ctx, delivery); err != nil {
				return err
			}
		}
	}
}

func (c *Consumer) handleDelivery(ctx context.Context, delivery amqp.Delivery) error {
	if err := c.process(ctx, delivery.Body); err != nil {
		if errors.Is(err, ErrInvalidMessage) {
			c.logger.Error("Rejecting invalid Payment integration message", "queue", c.queue, "messageId",
				delivery.MessageId, "error", err)
			if nackErr := delivery.Nack(false, false); nackErr != nil {
				return fmt.Errorf("reject invalid RabbitMQ message: %w", nackErr)
			}
			return nil
		}
		c.logger.Warn("Payment message could not be persisted; requeueing", "messageId", delivery.MessageId,
			"error", err)
		if nackErr := delivery.Nack(false, true); nackErr != nil {
			return fmt.Errorf("requeue Payment RabbitMQ message: %w", nackErr)
		}
		if !waitContext(ctx, c.retryDelay) {
			return nil
		}
		return nil
	}
	if err := delivery.Ack(false); err != nil {
		return fmt.Errorf("ack persisted Payment message: %w", err)
	}
	return nil
}

func waitContext(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
