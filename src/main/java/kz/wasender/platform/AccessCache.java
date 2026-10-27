package kz.wasender.platform;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

@Component
public class AccessCache {
    private static final Duration TTL = Duration.ofSeconds(5);
    private static final String TENANTS = "tenants";
    private static final String SUPERADMIN = "superadmin";

    private final UserRepository users;
    private final TenantRepository tenants;
    private final TtlCache<Long, Optional<AppUser>> userCache;
    private final TtlCache<String, List<Tenant>> tenantCache;
    private final TtlCache<String, Optional<AppUser>> superadminCache;

    public AccessCache(UserRepository users, TenantRepository tenants, Clock clock) {
        this.users = users;
        this.tenants = tenants;
        this.userCache = new TtlCache<>(TTL, clock);
        this.tenantCache = new TtlCache<>(TTL, clock);
        this.superadminCache = new TtlCache<>(TTL, clock);
    }

    public Optional<AppUser> user(long id) {
        return userCache.get(id, users::find);
    }

    public Optional<AppUser> superadmin() {
        return superadminCache.get(SUPERADMIN, key -> users.firstSuperadmin());
    }

    public Optional<Tenant> tenant(long id) {
        return allTenants().stream().filter(tenant -> tenant.id() == id).findFirst();
    }

    public Optional<Tenant> activeTenant(long id) {
        return tenant(id).filter(tenant -> tenant.status() == TenantStatus.ACTIVE);
    }

    public Optional<Tenant> defaultTenant() {
        return allTenants().stream().filter(tenant -> tenant.status() == TenantStatus.ACTIVE).findFirst();
    }

    public void invalidate() {
        userCache.clear();
        tenantCache.clear();
        superadminCache.clear();
    }

    private List<Tenant> allTenants() {
        return tenantCache.get(TENANTS, key -> tenants.findAll());
    }
}
