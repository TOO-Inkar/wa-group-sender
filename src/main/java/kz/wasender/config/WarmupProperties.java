package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * @param dailyLimits per-day limits from the first send; after the last one the warm-up is over
 * @param dailyCap    a standing daily limit, also after the warm-up (0 means none); the smaller of the two applies
 */
@ConfigurationProperties("app.warmup")
public record WarmupProperties(boolean enabled, List<Integer> dailyLimits, int dailyCap) {
}
