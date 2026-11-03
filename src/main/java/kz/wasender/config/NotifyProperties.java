package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

@ConfigurationProperties("app.notify")
public record NotifyProperties(Duration cooldown, Telegram telegram) {
    public record Telegram(String botToken, List<String> chatIds, String apiUrl) {
        private static final String HIDDEN_TOKEN = "<token>";

        public String describe(Throwable error) {
            var text = error.toString();
            if (botToken == null || botToken.isBlank()) {
                return text;
            }
            return text.replace(botToken, HIDDEN_TOKEN).replace(UriUtils.encode(botToken, StandardCharsets.UTF_8), HIDDEN_TOKEN);
        }
    }
}
