package kz.inkar.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.ZoneId;

@ConfigurationProperties("app")
public record AppProperties(ZoneId zone, boolean schedulingEnabled) {
}
