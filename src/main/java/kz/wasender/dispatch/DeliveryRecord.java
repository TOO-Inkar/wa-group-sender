package kz.wasender.dispatch;

public record DeliveryRecord(long id, String requestId, String groupJid, int position, DeliveryStatus status, String error, int attempts) {
}
