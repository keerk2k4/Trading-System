package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

/**
 * Authentication and authorization service.
 * 
 * Handles account access verification for trade controllers.
 * JWT verification (signature, expiry) is handled by JwtAuthenticationFilter
 * for all /api/v1/** routes. This service verifies that the account ID in the
 * JWT token matches the addressed account in the URL/request.
 * 
 * If the token's accountId doesn't match the requested account, an ACC-403
 * error is returned with the same message as a suspended account, preventing
 * account enumeration attacks.
 */
@Service
public class AuthService {
    
    private static final String ACCOUNT_ID_ATTRIBUTE = "accountId";

    public void requireBearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
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

    /**
     * Verifies that the account ID from the JWT token matches the requested account.
     * 
     * The JWT filter has already validated the token and extracted the accountId claim.
     * This method ensures the token's accountId matches the account being accessed.
     * 
     * @param request The HTTP request containing the accountId attribute from the JWT
     * @param requestedAccountId The account ID from the URL path or request body
     * @throws AccountNotActiveException if the account IDs don't match
     */
    public void verifyAccountAccess(HttpServletRequest request, long requestedAccountId) {
        requireBearerToken(request);
        Long tokenAccountId = (Long) request.getAttribute(ACCOUNT_ID_ATTRIBUTE);
        
        if (tokenAccountId == null || !tokenAccountId.equals(requestedAccountId)) {
            // Return ACC-403 with the same message as a suspended account
            // to prevent enumeration of valid account IDs
            throw new AccountNotActiveException(requestedAccountId);
        }
    }
}
