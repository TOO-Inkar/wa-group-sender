package kz.wasender.group;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record GroupRecord(String jid, @Nullable String name, boolean archived, @Nullable Boolean member, @Nullable Boolean canSend, boolean active,
                          Instant lastSync, @Nullable Integer participants, boolean community, boolean tooLarge, int rejectedCount, boolean rejected) {
}
