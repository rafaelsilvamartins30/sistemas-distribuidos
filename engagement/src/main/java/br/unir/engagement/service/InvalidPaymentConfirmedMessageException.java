package br.unir.engagement.service;

public class InvalidPaymentConfirmedMessageException extends RuntimeException {

    public InvalidPaymentConfirmedMessageException(String message) {
        super(message);
    }

    public InvalidPaymentConfirmedMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}
