package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

public record Actor(@Nullable Long userId, String login, Role role, @Nullable Tenant tenant, String ip) {
    public static final String ATTRIBUTE = "wa.actor";

    public boolean superadmin() {
        return role == Role.SUPERADMIN;
    }
}
