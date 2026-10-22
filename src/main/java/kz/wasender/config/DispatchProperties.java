package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.LocalTime;

/**
 * @param hourlyLimit       отправок в группы за последний час на номер, все заявки вместе (0 — без предела)
 * @param ownMessageGap     последнее сообщение в группе наше и моложе этого — доставка ждёт (0 — не проверять)
 */
@ConfigurationProperties("app.dispatch")
public record DispatchProperties(
        boolean autostart,
        int waveSize,
        Duration wavePauseMin,
        Duration wavePauseMax,
        Duration groupPauseMin,
        Duration groupPauseMax,
        Duration typingMin,
        Duration typingMax,
        Duration idlePoll,
        LocalTime windowStart,
        LocalTime windowEnd,
        boolean weekendsEnabled,
        int hourlyLimit,
        Duration ownMessageGap) {
}
