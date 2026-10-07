package com.tradingsystem.spring_boot_app.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    private static final String ACCOUNT_ID_ATTRIBUTE = "accountId";

    @Mock
    private JwtTokenProvider tokenProvider;
    @Mock
    private FilterChain filterChain;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter(tokenProvider);
    }

    @Test
    void routeOutsidePublicApiBypassesJwtValidation() throws Exception {
        MockHttpServletRequest request = request("/health");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verifyNoInteractions(tokenProvider);
        assertEquals(200, response.getStatus());
    }

    @Test
    void validBearerTokenStoresLongAccountIdAndContinuesChain() throws Exception {
        MockHttpServletRequest request = request("/api/v1/accounts/17");
        request.addHeader("Authorization", "Bearer valid.jwt.token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(tokenProvider.extractAccountId("valid.jwt.token")).thenReturn(17L);

        filter.doFilter(request, response, filterChain);

        verify(tokenProvider).extractAccountId("valid.jwt.token");
        verify(filterChain).doFilter(request, response);
        assertEquals(17L, request.getAttribute(ACCOUNT_ID_ATTRIBUTE));
    }

    @Test
    void validBearerTokenStoresRolesForAdminChecks() throws Exception {
        MockHttpServletRequest request = request("/api/v1/admin/health");
        request.addHeader("Authorization", "Bearer admin.jwt.token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(tokenProvider.extractAccountId("admin.jwt.token")).thenReturn(0L);
        when(tokenProvider.extractRoles("admin.jwt.token")).thenReturn(List.of("ADMIN"));

        filter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertEquals(0L, request.getAttribute(ACCOUNT_ID_ATTRIBUTE));
        assertEquals(List.of("ADMIN"), request.getAttribute("roles"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "   ",
            "Basic credentials",
            "bearer lowercase",
            "Bearer",
            "Bearer ",
            "Bearer     "
    })
    void malformedAuthorizationHeaderReturnsAuth401WithoutCallingProvider(String authorization) throws Exception {
        MockHttpServletRequest request = request("/api/v1/orders");
        if (authorization != null) {
            request.addHeader("Authorization", authorization);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, filterChain);

        assertAuth401Response(response);
        verifyNoInteractions(tokenProvider, filterChain);
    }

    @Test
    void tokenRejectedByProviderReturnsAuth401WithoutContinuingChain() throws Exception {
        MockHttpServletRequest request = request("/api/v1/accounts/17");
        request.addHeader("Authorization", "Bearer invalid.jwt.token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(tokenProvider.extractAccountId("invalid.jwt.token")).thenReturn(null);

        filter.doFilter(request, response, filterChain);

        assertAuth401Response(response);
        verifyNoInteractions(filterChain);
    }

    private static MockHttpServletRequest request(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI(path);
        return request;
    }

    private static void assertAuth401Response(MockHttpServletResponse response) throws Exception {
        JsonNode body = new ObjectMapper().readTree(response.getContentAsString());
        assertAll(
                () -> assertEquals(401, response.getStatus()),
                () -> assertEquals(MediaType.APPLICATION_JSON_VALUE, response.getContentType()),
                () -> assertEquals("AUTH-401", body.path("errorCode").asText()),
                () -> assertEquals("Unauthorised", body.path("message").asText()),
                () -> assertEquals(2, body.size())
        );
    }
}
