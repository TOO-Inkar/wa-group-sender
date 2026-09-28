package kz.inkar.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.risk")
public record RiskProperties(Duration window, int warnThreshold, int criticalThreshold, double pauseMultiplier) {
}
