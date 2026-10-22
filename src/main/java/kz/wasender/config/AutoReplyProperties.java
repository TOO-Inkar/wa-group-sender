package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * @param enabled     отвечать на личные сообщения номеру
 * @param rejectCalls отклонять входящие звонки и отвечать тем же текстом
 * @param cooldown    одному человеку отвечаем не чаще этого
 * @param text        текст ответа; пусто — стандартный
 */
@ConfigurationProperties("app.autoreply")
public record AutoReplyProperties(boolean enabled, boolean rejectCalls, Duration cooldown, String text) {
}
