package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record AppUser(long id, @Nullable Long tenantId, String login, String passwordHash, Role role, boolean enabled,
                      int sessionVersion, Instant createdAt, @Nullable Instant lastLoginAt) {
    public boolean superadmin() {
        return role == Role.SUPERADMIN;
    }
}
