package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.campaign")
public record CampaignProperties(Duration startJitterMin, Duration startJitterMax) {
}
