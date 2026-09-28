package kz.wasender.notify;

import kz.wasender.config.NotifyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
public class TelegramNotifier implements Notifier {

    private static final Logger log = LoggerFactory.getLogger(TelegramNotifier.class);

    private final NotifyProperties.Telegram properties;
    private final RestClient client;

    public TelegramNotifier(NotifyProperties properties) {
        this.properties = properties.telegram();
        this.client = RestClient.create(this.properties.apiUrl());
    }

    @Override
    public String name() {
        return "telegram";
    }

    @Override
    public boolean configured() {
        return properties.botToken() != null && !properties.botToken().isBlank() && !chatIds().isEmpty();
    }

    @Override
    public int send(String text) {
        var delivered = 0;
        for (var chatId : chatIds()) {
            try {
                client.post()
                        .uri("/bot{token}/sendMessage", properties.botToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("chat_id", chatId, "text", text, "disable_web_page_preview", true))
                        .retrieve()
                        .toBodilessEntity();
                delivered++;
            } catch (RuntimeException e) {
                log.error("ALERT telegram chat_id={} failed: {}", chatId, e.getMessage());
            }
        }
        return delivered;
    }

    private List<String> chatIds() {
        if (properties.chatIds() == null) {
            return List.of();
        }
        return properties.chatIds().stream().map(String::strip).filter(id -> !id.isEmpty()).toList();
    }
}
