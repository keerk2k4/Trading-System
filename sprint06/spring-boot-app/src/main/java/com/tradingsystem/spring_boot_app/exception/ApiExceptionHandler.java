package com.tradingsystem.spring_boot_app.exception;

import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.DuplicateOrderException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.exception.OptimisticLockException;
import com.tradingsystem.spring_boot_app.dto.ErrorResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);
    @ExceptionHandler(UnauthorisedException.class)
    ResponseEntity<ErrorResponse> unauthorised() {
        return response(HttpStatus.UNAUTHORIZED, "AUTH-401", "Unauthorised");
    }

    @ExceptionHandler(AccountNotFoundException.class)
    ResponseEntity<ErrorResponse> accountNotFound() {
        return response(HttpStatus.NOT_FOUND, "ACC-404", "Account not found");
    }

    @ExceptionHandler({InstrumentNotFoundException.class, InstrumentDelistedException.class})
    ResponseEntity<ErrorResponse> instrumentNotFound() {
        return response(HttpStatus.NOT_FOUND, "INS-404", "Instrument not found");
    }

    @ExceptionHandler(AccountNotActiveException.class)
    ResponseEntity<ErrorResponse> accountNotActive() {
        return response(HttpStatus.FORBIDDEN, "ACC-403", "Account not active");
    }

    @ExceptionHandler(InsufficientFundsException.class)
    ResponseEntity<ErrorResponse> insufficientFunds() {
        return response(HttpStatus.BAD_REQUEST, "ORD-400", "Insufficient funds");
    }

    @ExceptionHandler(InsufficientHoldingsException.class)
    ResponseEntity<ErrorResponse> insufficientHoldings() {
        return response(HttpStatus.CONFLICT, "ORD-409", "Insufficient holdings");
    }

    @ExceptionHandler(DuplicateOrderException.class)
    ResponseEntity<ErrorResponse> duplicateOrder() {
        return response(HttpStatus.CONFLICT, "ORD-409", "Duplicate order");
    }

    @ExceptionHandler(OptimisticLockException.class)
    ResponseEntity<ErrorResponse> concurrentUpdate() {
        return response(HttpStatus.CONFLICT, "ORD-409", "Order conflict");
    }

    @ExceptionHandler(OrderNotFoundException.class)
    ResponseEntity<ErrorResponse> orderNotFound() {
        return response(HttpStatus.NOT_FOUND, "ORD-409", "Order not found");
    }

    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<ErrorResponse> notCancellable() {
        return response(HttpStatus.CONFLICT, "ORD-409", "Order is not cancellable");
    }

        @ExceptionHandler({InvalidOrderArgumentException.class, MethodArgumentNotValidException.class,
            ConstraintViolationException.class, MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class})
    ResponseEntity<ErrorResponse> invalidInput() {
        return response(HttpStatus.UNPROCESSABLE_ENTITY, "VAL-422", "Invalid input");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    ResponseEntity<ErrorResponse> routeNotFound() {
        return response(HttpStatus.NOT_FOUND, "API-404", "Not found");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpected(Exception exception) {
        LOGGER.error("Unhandled API exception", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "ERR-500", "Internal server error");
    }

    private ResponseEntity<ErrorResponse> response(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(new ErrorResponse(code, message));
    }
}
