package br.unir.engagement.config;

import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
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
}
