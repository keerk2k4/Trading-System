package com.tradingsystem.spring_boot_app.exception;

import com.tradingsystem.spring_boot_app.dto.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void optimisticLockFailureUsesOrderConflictEnvelope() {
        ResponseEntity<ErrorResponse> response = handler.concurrentUpdate();

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals(new ErrorResponse("ORD-409", "Order conflict"), response.getBody());
    }

    @Test
    void forbiddenUsesAuth403Envelope() {
        ResponseEntity<ErrorResponse> response = handler.forbidden();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals(new ErrorResponse("AUTH-403", "Forbidden"), response.getBody());
    }

    @Test
    void unexpectedFailureUsesSafeServerErrorEnvelope() {
        ResponseEntity<ErrorResponse> response = handler.unexpected(
                new IllegalArgumentException("database password and internal detail"));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertEquals(new ErrorResponse("ERR-500", "Internal server error"), response.getBody());
    }
}
