package com.tradingsystem.spring_boot_app.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.service.AccountSessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * JWT authentication filter for all /api/v1/** routes.
 * 
 * Validates bearer tokens in the Authorization header:
 * 1. Checks header is present and has "Bearer " prefix
 * 2. Validates JWT token (signature, expiry, algorithm)
 * 3. Extracts account ID and roles from token claims
 * 4. Refuses a customer whose trading account is BLOCKED or CLOSED (ACC-403),
 *    so a token issued before the block stops working at once
 * 5. Stores account ID and roles in request attributes for controller use
 * 
 * All validation failures (missing header, wrong scheme, invalid/expired token)
 * return AUTH-401 with the same error message.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ACCOUNT_ID_ATTRIBUTE = "accountId";
    private static final String ROLES_ATTRIBUTE = "roles";
    private static final String SUBJECT_ATTRIBUTE = "subject";
    private final JwtTokenProvider tokenProvider;
    private final AccountSessionService accountSessions;
    
    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, AccountSessionService accountSessions) {
        this.tokenProvider = tokenProvider;
        this.accountSessions = accountSessions;
    }
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        
        // Only validate /api/v1/** routes
        String requestPath = request.getRequestURI();
        if (!requestPath.startsWith("/api/v1/")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        try {
            // Extract and validate Authorization header
            String authHeader = request.getHeader("Authorization");
            
            if (authHeader == null || authHeader.isBlank()) {
                throw new UnauthorisedException();
            }
            
            if (!authHeader.startsWith(BEARER_PREFIX)) {
                throw new UnauthorisedException();
            }
            
            String token = authHeader.substring(BEARER_PREFIX.length());
            
            if (token.isBlank()) {
                throw new UnauthorisedException();
            }
            
            // Validate token and extract account ID
            // Validation order: signature → expiry → algorithm
            Long accountId = tokenProvider.extractAccountId(token);
            
            if (accountId == null) {
                // Token validation failed (signature, expiry, or algorithm check)
                throw new UnauthorisedException();
            }
            
            // A valid token for an account blocked or closed since it was issued.
            // Admin tokens carry accountId 0 and no trading account to check.
            if (accountId != 0 && accountSessions.isLockedOut(accountId)) {
                sendErrorResponse(response, 403, "ACC-403", "Account not active");
                return;
            }

            // Store account ID and roles in request attributes for controller access.
            // Roles decide admin-only routes (AuthService.requireAdmin); they never
            // widen what a customer route returns, which stays scoped to accountId.
            request.setAttribute(ACCOUNT_ID_ATTRIBUTE, accountId);
            request.setAttribute(ROLES_ATTRIBUTE, tokenProvider.extractRoles(token));
            request.setAttribute(SUBJECT_ATTRIBUTE, tokenProvider.extractSubject(token));
            
            // Continue the filter chain
            filterChain.doFilter(request, response);
        } catch (UnauthorisedException ex) {
            // Handle auth failure by writing JSON error response
            // Must catch here because filters don't go through @ControllerAdvice
            sendErrorResponse(response, 401, "AUTH-401", "Unauthorised");
        }
    }
    
    /**
     * Sends a JSON error response.
     * Used for filter-level exceptions that don't reach @ControllerAdvice.
     */
    private void sendErrorResponse(HttpServletResponse response, int status, String code, String message) 
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        
        Map<String, String> errorMap = new HashMap<>();
        errorMap.put("errorCode", code);
        errorMap.put("message", message);
        
        ObjectMapper objectMapper = new ObjectMapper();
        response.getWriter().write(objectMapper.writeValueAsString(errorMap));
    }
}
