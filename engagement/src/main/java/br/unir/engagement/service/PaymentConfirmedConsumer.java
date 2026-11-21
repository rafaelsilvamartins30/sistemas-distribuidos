package br.unir.engagement.service;

import br.unir.engagement.config.RabbitMqConfiguration;
import com.rabbitmq.client.Channel;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class PaymentConfirmedConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(PaymentConfirmedConsumer.class);
    private static final long RETRY_DELAY_MILLIS = 1000;

    private final PaymentConfirmationService paymentConfirmationService;

    public PaymentConfirmedConsumer(PaymentConfirmationService paymentConfirmationService) {
        this.paymentConfirmationService = paymentConfirmationService;
    }

    @RabbitListener(queues = RabbitMqConfiguration.ENGAGEMENT_PAYMENT_EVENTS_QUEUE)
    public void receive(Message message, Channel channel) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        try {
            this.paymentConfirmationService.consume(message.getBody());
            channel.basicAck(deliveryTag, false);
        } catch (InvalidPaymentConfirmedMessageException exception) {
            LOGGER.error("Rejecting invalid PaymentConfirmed message {}: {}",
                    message.getMessageProperties().getMessageId(), exception.getMessage());
            channel.basicReject(deliveryTag, false);
        } catch (RuntimeException exception) {
            LOGGER.warn("PaymentConfirmed message {} could not be committed; it will be retried: {}",
                    message.getMessageProperties().getMessageId(), exception.getMessage());
            try {
                Thread.sleep(RETRY_DELAY_MILLIS);
            } catch (InterruptedException interruptedException) {
                Thread.currentThread().interrupt();
            }
            channel.basicNack(deliveryTag, false, true);
        }
    }
}
