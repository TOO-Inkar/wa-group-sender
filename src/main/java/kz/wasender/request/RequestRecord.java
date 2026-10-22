package kz.wasender.request;

import java.time.Instant;
import java.time.LocalTime;

public record RequestRecord(
        String id,
        Integer sheetRow,
        String message,
        RequestStatus status,
        String error,
        Instant queuedAt,
        Instant startedAt,
        Instant completedAt,
        String campaignId,
        LocalTime windowStart,
        LocalTime windowEnd) {
    public String sheetStatus() {
        return error == null || error.isBlank() ? status.sheetText() : status.sheetText() + ": " + error;
    }
}
