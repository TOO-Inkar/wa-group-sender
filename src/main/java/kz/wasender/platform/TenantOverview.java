package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record TenantOverview(long id, String name, TenantStatus status, boolean legacy, Instant createdAt, int users, String session,
                             @Nullable String account, String dispatcher, long activeGroups, int sentToday, int sentLastHour,
                             int queueLength, boolean stoppedByRisk, @Nullable String proxy, boolean proxyRequired) {
    static TenantOverview of(Tenant tenant, int users, TenantStats stats, boolean proxyRequired) {
        return new TenantOverview(tenant.id(), tenant.name(), tenant.status(), tenant.legacy(), tenant.createdAt(), users, stats.session(),
                stats.account(), stats.dispatcher(), stats.activeGroups(), stats.sentToday(), stats.sentLastHour(), stats.queueLength(),
                stats.stoppedByRisk(), ProxyUrls.mask(tenant.proxyUrl()), proxyRequired);
    }
}
