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
	processor  MessageProcessor
	logger     *slog.Logger
	retryDelay time.Duration
}

func NewConsumer(url string, processor MessageProcessor, logger *slog.Logger) *Consumer {
	if logger == nil {
		logger = slog.Default()
	}
	return &Consumer{
		url:        url,
		queue:      RegistrationPaymentQueue,
		processor:  processor,
		logger:     logger,
		retryDelay: time.Second,
	}
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

	queue, err := channel.QueueDeclare(RegistrationPaymentQueue, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("declare Payment request queue: %w", err)
	}
	if err := channel.Qos(1, 0, false); err != nil {
		return fmt.Errorf("configure Payment consumer prefetch: %w", err)
	}
	deliveries, err := channel.ConsumeWithContext(ctx, queue.Name, "payment-registration-requested-v1", false,
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
	if err := c.processor.Process(ctx, delivery.Body); err != nil {
		if errors.Is(err, ErrInvalidMessage) {
			c.logger.Error("Rejecting invalid RegistrationPaymentRequested message", "messageId",
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
