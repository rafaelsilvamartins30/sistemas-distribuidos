package br.unir.engagement.config;

import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.dto.RefundFailedPayload;
import br.unir.engagement.dto.RefundRequestedPayload;
import br.unir.engagement.dto.RefundSucceededPayload;
import br.unir.engagement.dto.RegistrationCancelledByEventPayload;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMqConfiguration {

    public static final String EXCHANGE_NAME = "unir.events";
    public static final String PAYMENT_QUEUE = "payment.registration-requests";
    public static final String PAYMENT_REFUND_REQUESTS_QUEUE = "payment.refund-requests";
    public static final String PAYMENT_REGISTRATION_CANCELLED_QUEUE = "payment.registration-cancelled";
    public static final String ENGAGEMENT_PAYMENT_EVENTS_QUEUE = "engagement.payment-events";
    public static final String ENGAGEMENT_REFUND_RESULTS_QUEUE = "engagement.refund-results";

    @Bean
    TopicExchange integrationEventsExchange() {
        return new TopicExchange(EXCHANGE_NAME, true, false);
    }

    @Bean
    Queue paymentRegistrationRequestsQueue() {
        return QueueBuilder.durable(PAYMENT_QUEUE).build();
    }

    @Bean
    Binding paymentRegistrationRequestsBinding(Queue paymentRegistrationRequestsQueue,
            TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(paymentRegistrationRequestsQueue).to(integrationEventsExchange)
                .with(RegistrationPaymentRequestedPayload.ROUTING_KEY);
    }

    @Bean
    Queue paymentRefundRequestsQueue() {
        return QueueBuilder.durable(PAYMENT_REFUND_REQUESTS_QUEUE).build();
    }

    @Bean
    Queue paymentRegistrationCancelledQueue() {
        return QueueBuilder.durable(PAYMENT_REGISTRATION_CANCELLED_QUEUE).build();
    }

    @Bean
    Binding paymentRefundRequestsBinding(Queue paymentRefundRequestsQueue, TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(paymentRefundRequestsQueue).to(integrationEventsExchange)
                .with(RefundRequestedPayload.ROUTING_KEY);
    }

    @Bean
    Binding paymentRegistrationCancelledBinding(Queue paymentRegistrationCancelledQueue,
            TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(paymentRegistrationCancelledQueue).to(integrationEventsExchange)
                .with(RegistrationCancelledByEventPayload.ROUTING_KEY);
    }

    @Bean
    Queue engagementPaymentEventsQueue() {
        return QueueBuilder.durable(ENGAGEMENT_PAYMENT_EVENTS_QUEUE).build();
    }

    @Bean
    Binding engagementPaymentEventsBinding(Queue engagementPaymentEventsQueue,
            TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(engagementPaymentEventsQueue).to(integrationEventsExchange)
                .with(PaymentConfirmedPayload.ROUTING_KEY);
    }

    @Bean
    Queue engagementRefundResultsQueue() {
        return QueueBuilder.durable(ENGAGEMENT_REFUND_RESULTS_QUEUE).build();
    }

    @Bean
    Binding engagementRefundSucceededBinding(Queue engagementRefundResultsQueue,
            TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(engagementRefundResultsQueue).to(integrationEventsExchange)
                .with(RefundSucceededPayload.ROUTING_KEY);
    }

    @Bean
    Binding engagementRefundFailedBinding(Queue engagementRefundResultsQueue, TopicExchange integrationEventsExchange) {
        return BindingBuilder.bind(engagementRefundResultsQueue).to(integrationEventsExchange)
                .with(RefundFailedPayload.ROUTING_KEY);
    }
}
