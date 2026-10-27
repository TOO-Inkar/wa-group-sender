package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record AuditEntry(Instant at, @Nullable String actor, @Nullable Long tenantId, @Nullable String tenantName, AuditAction action,
                         @Nullable String detail, @Nullable String ip) {
}
