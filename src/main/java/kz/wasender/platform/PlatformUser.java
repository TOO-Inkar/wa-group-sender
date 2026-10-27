package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record PlatformUser(long id, String login, boolean enabled, Instant createdAt, @Nullable Instant lastLoginAt) {
    static PlatformUser of(AppUser user) {
        return new PlatformUser(user.id(), user.login(), user.enabled(), user.createdAt(), user.lastLoginAt());
    }
}
