package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.autoreply")
public record AutoReplyProperties(boolean enabled, boolean rejectCalls, Duration cooldown, String text) {
}
