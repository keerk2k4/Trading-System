package com.tradingsystem.spring_boot_app.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT token validation utility.
 * 
 * Validates tokens in the following order:
 * 1. Signature (HMAC-SHA256)
 * 2. Expiration
 * 3. Algorithm
 * 
 * All validation failures return null and log details for investigation.
 */
@Component
public class JwtTokenProvider {
    
    private static final Logger LOGGER = LoggerFactory.getLogger(JwtTokenProvider.class);
    private static final String ALGORITHM = "HS256";
    private static final String ACCOUNT_ID_CLAIM = "accountId";
    
    private final SecretKey secretKey;
    
    public JwtTokenProvider(@Value("${jwt.secret}") String secret) {
        // HS256 requires at least 256 bits (32 bytes)
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 32 characters");
        }
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
    
    /**
     * Extracts and validates the account ID from a JWT token.
     * 
     * Validation order:
     * 1. Verify signature using the secret key
     * 2. Verify token has not expired
     * 3. Verify algorithm is HS256
     * 
     * @param token The JWT token string (without "Bearer " prefix)
     * @return The account ID from the token, or null if validation fails
     */
    public Long extractAccountId(String token) {
        try {
            // Parse and verify signature (step 1)
            // This throws JwtException if signature is invalid or token is malformed
            Jws<Claims> jws = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token);
            
            Claims claims = jws.getBody();
            
            // Verify expiration (step 2)
            // The parser automatically checks exp claim, but we verify explicitly for logging
            Date expirationDate = claims.getExpiration();
            if (expirationDate != null && expirationDate.before(new Date())) {
                LOGGER.warn("Token is expired: {}", expirationDate);
                return null;
            }
            
            // Verify algorithm (step 3)
            String algorithm = jws.getHeader().getAlgorithm();
            if (!ALGORITHM.equals(algorithm)) {
                LOGGER.warn("Token uses wrong algorithm: {} (expected {})", algorithm, ALGORITHM);
                return null;
            }
            
            // Extract account ID claim
            Object accountIdObj = claims.get(ACCOUNT_ID_CLAIM);
            if (accountIdObj == null) {
                LOGGER.warn("Token missing {} claim", ACCOUNT_ID_CLAIM);
                return null;
            }
            
            if (accountIdObj instanceof Integer) {
                return ((Integer) accountIdObj).longValue();
            } else if (accountIdObj instanceof Long) {
                return (Long) accountIdObj;
            } else {
                LOGGER.warn("Invalid {} claim type: {}", ACCOUNT_ID_CLAIM, accountIdObj.getClass());
                return null;
            }
            
        } catch (SecurityException e) {
            LOGGER.warn("Invalid JWT signature: {}", e.getMessage());
            return null;
        } catch (MalformedJwtException e) {
            LOGGER.warn("Invalid JWT format: {}", e.getMessage());
            return null;
        } catch (ExpiredJwtException e) {
            LOGGER.warn("Expired JWT token");
            return null;
        } catch (UnsupportedJwtException e) {
            LOGGER.warn("Unsupported JWT: {}", e.getMessage());
            return null;
        } catch (IllegalArgumentException e) {
            LOGGER.warn("JWT claims string is empty: {}", e.getMessage());
            return null;
        }
    }
}
