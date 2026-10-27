package kz.wasender.platform;

import java.time.Instant;

public record Tenant(long id, String name, TenantStatus status, boolean legacy, String inviteCode, Instant createdAt) {
    public String key() {
        return "t" + id;
    }
}
