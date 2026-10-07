package com.tradingsystem.spring_boot_app.security;

import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtTokenProviderTest {

    private static final String SECRET =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final SecretKey SIGNING_KEY = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    private static final SecretKey OTHER_SIGNING_KEY = Keys.hmacShaKeyFor(
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789".getBytes(StandardCharsets.UTF_8));

    private JwtTokenProvider provider;

    @BeforeEach
    void setUp() {
        provider = new JwtTokenProvider(SECRET);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"too-short", "1234567890123456789012345678901"})
    void constructorRejectsSecretsShorterThan256Bits(String secret) {
        IllegalArgumentException failure = assertThrows(IllegalArgumentException.class,
                () -> new JwtTokenProvider(secret));

        assertEquals("JWT secret must be at least 32 characters", failure.getMessage());
    }

    @Test
    void extractsSmallNumericAccountIdClaim() {
        String token = signedToken(42, futureExpiration(), SIGNING_KEY);

        assertEquals(42L, provider.extractAccountId(token));
    }

    @Test
    void extractsLargeNumericAccountIdClaim() {
        String token = signedToken(4_294_967_296L, futureExpiration(), SIGNING_KEY);

        assertEquals(4_294_967_296L, provider.extractAccountId(token));
    }

    @Test
    void rejectsTokenWithoutAccountIdClaim() {
        String token = signedToken(null, futureExpiration(), SIGNING_KEY);

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsNonNumericAccountIdClaim() {
        String token = signedToken("not-an-account", futureExpiration(), SIGNING_KEY);

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsExpiredToken() {
        String token = signedToken(42L, Date.from(Instant.now().minusSeconds(60)), SIGNING_KEY);

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        String token = signedToken(42L, futureExpiration(), OTHER_SIGNING_KEY);

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsTokenSignedWithNonHs256Algorithm() {
        JwtBuilder builder = Jwts.builder()
                .subject("user-42")
                .claim("accountId", 42L)
                .expiration(futureExpiration());
        String token = builder.signWith(SIGNING_KEY, Jwts.SIG.HS512).compact();

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsUnsignedToken() {
        String token = Jwts.builder()
                .subject("user-42")
                .claim("accountId", 42L)
                .expiration(futureExpiration())
                .compact();

        assertNull(provider.extractAccountId(token));
    }

    @Test
    void rejectsMalformedToken() {
        assertNull(provider.extractAccountId("not-a-jwt"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    void rejectsNullOrEmptyToken(String token) {
        assertNull(provider.extractAccountId(token));
    }

    @Test
    void extractsRolesClaimAsUppercase() {
        String token = tokenWithRoles(List.of("admin", "Customer"), SIGNING_KEY);

        assertEquals(List.of("ADMIN", "CUSTOMER"), provider.extractRoles(token));
    }

    @Test
    void returnsNoRolesWhenClaimIsMissing() {
        String token = signedToken(42L, futureExpiration(), SIGNING_KEY);

        assertEquals(List.of(), provider.extractRoles(token));
    }

    @Test
    void returnsNoRolesForTokenSignedWithAnotherSecret() {
        String token = tokenWithRoles(List.of("ADMIN"), OTHER_SIGNING_KEY);

        assertEquals(List.of(), provider.extractRoles(token));
    }

    @Test
    void returnsNoRolesForExpiredToken() {
        String token = Jwts.builder()
                .subject("admin-under-test")
                .claim("accountId", 0)
                .claim("roles", List.of("ADMIN"))
                .expiration(Date.from(Instant.now().minusSeconds(60)))
                .signWith(SIGNING_KEY, Jwts.SIG.HS256)
                .compact();

        assertEquals(List.of(), provider.extractRoles(token));
    }

    @Test
    void acceptsAdminTokenWhoseAccountIdIsZero() {
        String token = tokenWithRoles(List.of("ADMIN"), SIGNING_KEY);

        assertEquals(0L, provider.extractAccountId(token));
    }

    @Test
    void extractsTheSubjectOfAValidToken() {
        assertEquals("admin-under-test", provider.extractSubject(tokenWithRoles(List.of("ADMIN"), SIGNING_KEY)));
    }

    @Test
    void returnsNoSubjectForATokenSignedWithAnotherSecret() {
        assertNull(provider.extractSubject(tokenWithRoles(List.of("ADMIN"), OTHER_SIGNING_KEY)));
    }

    private static String tokenWithRoles(List<String> roles, SecretKey key) {
        return Jwts.builder()
                .subject("admin-under-test")
                .claim("accountId", 0)
                .claim("roles", roles)
                .expiration(futureExpiration())
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    private static String signedToken(Object accountId, Date expiration, SecretKey key) {
        JwtBuilder builder = Jwts.builder().subject("user-under-test");
        if (accountId != null) {
            builder.claim("accountId", accountId);
        }
        if (expiration != null) {
            builder.expiration(expiration);
        }
        return builder.signWith(key, Jwts.SIG.HS256).compact();
    }

    private static Date futureExpiration() {
        return Date.from(Instant.now().plusSeconds(300));
    }
}
