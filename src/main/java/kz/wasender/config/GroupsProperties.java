package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.groups")
public record GroupsProperties(Duration syncInterval, Duration initialSyncDelay, int maxParticipants) {
}
