package br.unir.engagement.service;

public class InvalidRefundResultMessageException extends RuntimeException {

    public InvalidRefundResultMessageException(String message) {
        super(message);
    }

    public InvalidRefundResultMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}
