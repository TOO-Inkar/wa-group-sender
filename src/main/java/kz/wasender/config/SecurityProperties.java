package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.security")
public record SecurityProperties(String adminToken, String header, String username, String passwordHash, Duration sessionTtl) {
}
