package com.tradingsystem.spring_boot_app.config;

import com.tradingsystem.spring_boot_app.security.JwtAuthenticationFilter;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

/**
 * Security configuration for JWT authentication.
 * Registers the JwtAuthenticationFilter to intercept all requests
 * and validate Bearer tokens for /api/v1/** routes.
 */
@Configuration
public class SecurityConfig {
    
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        return new JwtAuthenticationFilter(tokenProvider);
    }
    
    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> filterRegistrationBean(JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registrationBean = new FilterRegistrationBean<>(filter);
        registrationBean.addUrlPatterns("/api/v1/*", "/api/v1/**");
        registrationBean.setOrder(1);
        return registrationBean;
    }

    /**
     * Allows the Angular UI (served from a different origin) to call this API.
     * Ordered ahead of the JWT filter so that the browser's CORS preflight,
     * which never carries an Authorization header, is answered here instead
     * of being rejected with AUTH-401.
     */
    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistrationBean(
            @Value("${ui.origin:http://localhost:4200}") String uiOrigin) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(uiOrigin));
        configuration.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**", configuration);

        FilterRegistrationBean<CorsFilter> registrationBean = new FilterRegistrationBean<>(new CorsFilter(source));
        registrationBean.setOrder(0);
        return registrationBean;
    }
}
