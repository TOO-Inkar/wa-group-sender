package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.notify")
public record NotifyProperties(String channel, Duration cooldown, Telegram telegram, Email email) {

    public record Telegram(String botToken, String chatId, String apiUrl) {
    }

    public record Email(String from, String to, String subject) {
    }
}
