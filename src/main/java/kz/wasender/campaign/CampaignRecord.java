package kz.wasender.campaign;

import java.time.Instant;

public record CampaignRecord(String id, String title, String draft, String message, boolean targeted, String targetLabel,
                             Schedule schedule, boolean enabled, boolean deleted, Instant createdAt, Instant updatedAt,
                             Instant nextRunAt, Instant lastRunAt) {
}
