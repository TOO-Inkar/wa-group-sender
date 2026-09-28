package kz.wasender.notify;

import kz.wasender.config.NotifyProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class TelegramNotifier implements Notifier {

    private final NotifyProperties.Telegram properties;
    private final RestClient client;

    public TelegramNotifier(NotifyProperties properties) {
        this.properties = properties.telegram();
        this.client = RestClient.create(this.properties.apiUrl());
    }

    @Override
    public String channel() {
        return "telegram";
    }

    @Override
    public boolean configured() {
        return hasText(properties.botToken()) && hasText(properties.chatId());
    }

    @Override
    public void send(String text) {
        client.post()
                .uri("/bot{token}/sendMessage", properties.botToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("chat_id", properties.chatId(), "text", text, "disable_web_page_preview", true))
                .retrieve()
                .toBodilessEntity();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
