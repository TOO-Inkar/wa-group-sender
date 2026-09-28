package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties("app.notify")
public record NotifyProperties(Duration cooldown, Telegram telegram) {

    public record Telegram(String botToken, List<String> chatIds, String apiUrl) {
    }
}
