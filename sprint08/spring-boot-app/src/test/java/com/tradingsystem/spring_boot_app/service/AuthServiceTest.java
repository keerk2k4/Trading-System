package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthServiceTest {

    private static final String ACCOUNT_ID_ATTRIBUTE = "accountId";

    private final AuthService authService = new AuthService();

    @Test
    void requireBearerTokenAcceptsAnyNonBlankOpaqueBearerToken() {
        assertDoesNotThrow(() -> authService.requireBearerToken(
                requestWithAuthorization("Bearer opaque-token")));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void requireBearerTokenRejectsMissingOrBlankHeader(String authorization) {
        UnauthorisedException failure = assertThrows(UnauthorisedException.class,
                () -> authService.requireBearerToken(requestWithAuthorization(authorization)));

        assertEquals("Unauthorised", failure.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Basic credentials",
            "bearer lowercase",
            "Bearer",
            "Bearer ",
            "Bearer     ",
            "Token opaque-token"
    })
    void requireBearerTokenRejectsWrongSchemeOrEmptyToken(String authorization) {
        assertThrows(UnauthorisedException.class,
                () -> authService.requireBearerToken(requestWithAuthorization(authorization)));
    }

    @Test
    void verifyAccountAccessAcceptsMatchingLongAccountClaim() {
        MockHttpServletRequest request = requestWithAuthorization("Bearer opaque-token");
        request.setAttribute(ACCOUNT_ID_ATTRIBUTE, 91L);

        assertDoesNotThrow(() -> authService.verifyAccountAccess(request, 91L));
    }

    @Test
    void verifyAccountAccessRejectsMissingAccountClaimWithIndistinguishableError() {
        MockHttpServletRequest request = requestWithAuthorization("Bearer opaque-token");

        AccountNotActiveException failure = assertThrows(AccountNotActiveException.class,
                () -> authService.verifyAccountAccess(request, 91L));

        assertEquals(91L, failure.getAccountId());
        assertEquals("ACC-403", failure.getCode());
        assertEquals("Account not active", failure.getMessage());
    }

    @Test
    void verifyAccountAccessRejectsMismatchedAccountClaimWithIndistinguishableError() {
        MockHttpServletRequest request = requestWithAuthorization("Bearer opaque-token");
        request.setAttribute(ACCOUNT_ID_ATTRIBUTE, 90L);

        AccountNotActiveException failure = assertThrows(AccountNotActiveException.class,
                () -> authService.verifyAccountAccess(request, 91L));

        assertEquals(91L, failure.getAccountId());
        assertEquals("ACC-403", failure.getCode());
        assertEquals("Account not active", failure.getMessage());
    }

    @Test
    void verifyAccountAccessChecksBearerHeaderBeforeAccountClaim() {
        MockHttpServletRequest request = requestWithAuthorization(null);
        request.setAttribute(ACCOUNT_ID_ATTRIBUTE, 91L);

        assertThrows(UnauthorisedException.class,
                () -> authService.verifyAccountAccess(request, 91L));
    }

    private static MockHttpServletRequest requestWithAuthorization(String authorization) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (authorization != null) {
            request.addHeader("Authorization", authorization);
        }
        return request;
    }
}
