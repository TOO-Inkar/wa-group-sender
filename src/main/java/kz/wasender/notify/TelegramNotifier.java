package kz.wasender.notify;

import kz.wasender.config.NotifyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Component
public class TelegramNotifier implements Notifier {
    private static final Logger log = LoggerFactory.getLogger(TelegramNotifier.class);

    private final NotifyProperties.Telegram properties;
    private final RestClient client;
    private final TelegramSubscriberRepository subscribers;

    @Autowired
    public TelegramNotifier(NotifyProperties properties, TelegramSubscriberRepository subscribers) {
        this.properties = properties.telegram();
        this.client = RestClient.create(this.properties.apiUrl());
        this.subscribers = subscribers;
    }

    public TelegramNotifier(NotifyProperties properties) {
        this(properties, null);
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

    public List<String> chatIds() {
        var ids = new LinkedHashSet<String>(configuredChatIds());
        if (subscribers != null) {
            ids.addAll(subscribers.approvedChatIds());
        }
        return List.copyOf(ids);
    }

    public List<String> configuredChatIds() {
        if (properties.chatIds() == null) {
            return List.of();
        }
        return properties.chatIds().stream().map(String::strip).filter(id -> !id.isEmpty()).toList();
    }

    public boolean sendTo(String chatId, String text) {
        if (properties.botToken() == null || properties.botToken().isBlank()) {
            return false;
        }
        try {
            client.post()
                    .uri("/bot{token}/sendMessage", properties.botToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("chat_id", chatId, "text", text, "disable_web_page_preview", true))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RuntimeException e) {
            log.error("TELEGRAM chat_id={} failed: {}", chatId, e.getMessage());
            return false;
        }
    }
}
