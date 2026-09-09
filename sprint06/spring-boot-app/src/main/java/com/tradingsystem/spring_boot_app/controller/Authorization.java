package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;

/**
 * Shared request guards for the trade controllers.
 *
 * <p>Full JWT verification (signature, expiry, {@code accountId}-claim match
 * against the addressed account) lands with the security layer; this step
 * enforces the contract's observable edge now: every {@code /api/v1/**} route
 * without a well-formed {@code Bearer} token fails {@code AUTH-401}, 401, as
 * the error envelope.
 */
final class Authorization {

    private Authorization() {
    }

    static void requireBearerToken(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw new UnauthorisedException();
        }
        if (!authorization.startsWith("Bearer ")) {
            throw new UnauthorisedException();
        }
        if (authorization.substring("Bearer ".length()).isBlank()) {
            throw new UnauthorisedException();
        }
    }
}
