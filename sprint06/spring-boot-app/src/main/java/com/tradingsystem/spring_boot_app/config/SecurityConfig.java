package com.tradingsystem.spring_boot_app.config;

import com.tradingsystem.spring_boot_app.security.JwtAuthenticationFilter;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Security configuration for JWT authentication.
 * 
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
}
