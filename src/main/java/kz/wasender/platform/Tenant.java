package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record Tenant(long id, String name, TenantStatus status, boolean legacy, String inviteCode, Instant createdAt,
                     @Nullable String proxyUrl) {
    public String key() {
        return "t" + id;
    }

    @Override
    public String toString() {
        return "Tenant[id=" + id + ", name=" + name + ", status=" + status + ", legacy=" + legacy + ", proxy=" + ProxyUrls.mask(proxyUrl) + "]";
    }
}
