package br.unir.engagement.service;

final class InvalidEventProjectionMessageException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    InvalidEventProjectionMessageException(String message) {
        super(message);
    }
}
