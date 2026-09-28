package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.watchdog")
public record WatchdogProperties(
        Duration checkInterval,
        int maxAttempts,
        Duration initialDelay,
        Duration maxDelay,
        Duration connectTimeout) {
}
