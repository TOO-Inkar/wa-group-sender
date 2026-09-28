package kz.inkar.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.LocalTime;

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
        boolean weekendsEnabled) {
}
