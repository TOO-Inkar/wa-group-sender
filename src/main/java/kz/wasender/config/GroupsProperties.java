package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.groups")
/**
 * @param maxParticipants groups with more members are kept out of the dispatch (the server rejects sends to them with
 *                        error 479); 0 turns the limit off
 */
public record GroupsProperties(Duration syncInterval, Duration initialSyncDelay, int maxParticipants) {
}
