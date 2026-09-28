package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties("app.warmup")
public record WarmupProperties(boolean enabled, List<Integer> dailyLimits) {
}
