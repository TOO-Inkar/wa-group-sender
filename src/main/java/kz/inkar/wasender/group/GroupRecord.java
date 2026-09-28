package kz.inkar.wasender.group;

import java.time.Instant;

public record GroupRecord(String jid, String name, boolean archived, Boolean member, Boolean canSend, boolean active, Instant lastSync) {
}
