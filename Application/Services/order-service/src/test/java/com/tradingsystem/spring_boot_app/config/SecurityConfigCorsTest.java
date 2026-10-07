package com.tradingsystem.spring_boot_app.config;

import com.tradingsystem.spring_boot_app.security.JwtAuthenticationFilter;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import com.tradingsystem.spring_boot_app.service.AccountSessionService;
import jakarta.servlet.http.HttpServlet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.CorsFilter;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class SecurityConfigCorsTest {

    private static final String UI_ORIGIN = "http://localhost:4200";

    private FilterRegistrationBean<CorsFilter> cors;
    private FilterRegistrationBean<JwtAuthenticationFilter> jwt;

    @BeforeEach
    void setUp() {
        SecurityConfig config = new SecurityConfig();
        JwtTokenProvider tokenProvider =
                new JwtTokenProvider("your-256-bit-secret-key-for-hmac-sha256-token-signing");
        cors = config.corsFilterRegistrationBean(UI_ORIGIN);
        jwt = config.filterRegistrationBean(
                config.jwtAuthenticationFilter(tokenProvider, mock(AccountSessionService.class)));
    }

    @Test
    void corsFilterRunsBeforeJwtFilter() {
        assertTrue(cors.getOrder() < jwt.getOrder());
    }

    @Test
    void preflightFromUiOriginIsAnsweredWithoutReachingJwtFilter() throws Exception {
        MockHttpServletRequest request = preflight(UI_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        run(request, response);

        assertAll(
                () -> assertEquals(200, response.getStatus()),
                () -> assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin")),
                () -> assertTrue(response.getHeader("Access-Control-Allow-Headers")
                        .toLowerCase().contains("authorization")));
    }

            @Test
            void patchPreflightFromUiOriginIsAnsweredWithoutReachingJwtFilter() throws Exception {
            MockHttpServletRequest request = preflight(UI_ORIGIN, "PATCH");
            MockHttpServletResponse response = new MockHttpServletResponse();

            run(request, response);

            assertAll(
                () -> assertEquals(200, response.getStatus()),
                () -> assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin")),
                () -> assertTrue(response.getHeader("Access-Control-Allow-Methods")
                    .toUpperCase().contains("PATCH")));
            }

            @Test
            void putPreflightFromUiOriginIsAnsweredWithoutReachingJwtFilter() throws Exception {
            MockHttpServletRequest request = preflight(UI_ORIGIN, "PUT");
            MockHttpServletResponse response = new MockHttpServletResponse();

            run(request, response);

            assertAll(
                () -> assertEquals(200, response.getStatus()),
                () -> assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin")),
                () -> assertTrue(response.getHeader("Access-Control-Allow-Methods")
                    .toUpperCase().contains("PUT")));
            }

    @Test
    void preflightsForEveryUiRouteShareOnePolicy() throws Exception {
        String[] paths = {
            "/api/v1/orders",
            "/api/v1/orders/1",
            "/api/v1/accounts/me",
            "/api/v1/accounts/me/positions",
            "/api/v1/accounts/me/holdings",
            "/api/v1/instruments/AAPL/quote",
            "/api/v1/preferences/me",
            "/api/v1/notifications/me"
        };
        String[] methods = {"GET", "POST", "PUT", "PATCH", "DELETE"};
        for (String path : paths) {
            for (String method : methods) {
                MockHttpServletRequest request = preflight(UI_ORIGIN, method, path);
                MockHttpServletResponse response = new MockHttpServletResponse();

                run(request, response);

                assertAll(
                    () -> assertEquals(200, response.getStatus(), method + " " + path),
                    () -> assertEquals(UI_ORIGIN,
                        response.getHeader("Access-Control-Allow-Origin"), method + " " + path));
            }
        }
    }

    @Test
    void preflightFromOtherOriginIsRejected() throws Exception {
        MockHttpServletRequest request = preflight("http://evil.example");
        MockHttpServletResponse response = new MockHttpServletResponse();

        run(request, response);

        assertAll(
                () -> assertEquals(403, response.getStatus()),
                () -> assertNull(response.getHeader("Access-Control-Allow-Origin")));
    }

    @Test
    void unauthenticatedRequestFromUiOriginStillGetsAuth401WithCorsHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/accounts/17");
        request.setRequestURI("/api/v1/accounts/17");
        request.addHeader("Origin", UI_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        run(request, response);

        assertAll(
                () -> assertEquals(401, response.getStatus()),
                () -> assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin")));
    }

    private MockHttpServletRequest preflight(String origin) {
        return preflight(origin, "POST");
    }

    private MockHttpServletRequest preflight(String origin, String method) {
        return preflight(origin, method, "/api/v1/orders");
    }

    private MockHttpServletRequest preflight(String origin, String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", path);
        request.setRequestURI(path);
        request.addHeader("Origin", origin);
        request.addHeader("Access-Control-Request-Method", method);
        request.addHeader("Access-Control-Request-Headers", "authorization,content-type");
        return request;
    }

    private void run(MockHttpServletRequest request, MockHttpServletResponse response) throws Exception {
        new MockFilterChain(new NoOpServlet(), cors.getFilter(), jwt.getFilter()).doFilter(request, response);
    }

    private static final class NoOpServlet extends HttpServlet {
    }
}
