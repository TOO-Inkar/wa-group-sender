package kz.wasender.dispatch;

import java.time.Instant;

public record DeliveryRecord(long id, String requestId, String groupJid, int position, DeliveryStatus status, String error, int attempts,
                             Instant updatedAt) {
    public Instant sentAt() {
        return status == DeliveryStatus.SENT ? updatedAt : null;
    }
}
