package br.unir.engagement.service;

import br.unir.engagement.config.RabbitMqConfiguration;
import com.rabbitmq.client.Channel;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class RefundResultConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(RefundResultConsumer.class);
    private static final long RETRY_DELAY_MILLIS = 1000;

    private final RefundResultService refundResultService;

    @SuppressFBWarnings(value = "EI_EXPOSE_REP2", justification = "Spring injects the container-managed service dependency")
    public RefundResultConsumer(RefundResultService refundResultService) {
        this.refundResultService = refundResultService;
    }

    @RabbitListener(queues = RabbitMqConfiguration.ENGAGEMENT_REFUND_RESULTS_QUEUE)
    public void receive(Message message, Channel channel) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        try {
            this.refundResultService.consume(message.getBody());
            channel.basicAck(deliveryTag, false);
        } catch (InvalidRefundResultMessageException exception) {
            LOGGER.error("Rejecting invalid refund result {}: {}", message.getMessageProperties().getMessageId(),
                    exception.getMessage());
            channel.basicReject(deliveryTag, false);
        } catch (RuntimeException exception) {
            LOGGER.warn("Refund result {} could not be committed; it will be retried: {}",
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
