package kz.wasender.platform;

import kz.wasender.config.PlatformProperties;
import kz.wasender.config.SecurityProperties;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

@Component
public class PlatformBootstrap implements SmartInitializingSingleton {
    public static final String LEGACY_TENANT_NAME = "Кабинет 1";
    private static final Logger log = LoggerFactory.getLogger(PlatformBootstrap.class);

    private final TenantRepository tenants;
    private final UserRepository users;
    private final SecurityProperties security;
    private final PlatformProperties platform;
    private final Clock clock;

    public PlatformBootstrap(TenantRepository tenants, UserRepository users, SecurityProperties security, PlatformProperties platform,
                             Clock clock) {
        this.tenants = tenants;
        this.users = users;
        this.security = security;
        this.platform = platform;
        this.clock = clock;
    }

    @Override
    public void afterSingletonsInstantiated() {
        var legacy = tenants.findAll().stream().filter(Tenant::legacy).findFirst().orElseGet(() -> {
            var tenant = tenants.create(LEGACY_TENANT_NAME, true, InviteCodes.random(), Instant.now(clock));
            log.info("PLATFORM created legacy tenant id={}", tenant.id());
            return tenant;
        });
        if (platform.separateAdmin()) {
            separateAccounts(legacy);
        } else if (users.count() == 0) {
            createOwnerAs(Role.SUPERADMIN, null);
        }
    }

    private void separateAccounts(Tenant legacy) {
        var admin = platform.adminUsername().strip();
        if (users.findByLogin(admin).isEmpty()) {
            users.create(null, admin, platform.adminPasswordHash(), Role.SUPERADMIN, Instant.now(clock));
            log.info("PLATFORM created superadmin login={}", admin);
        }
        if (admin.equalsIgnoreCase(security.username())) {
            return;
        }
        users.findByLogin(security.username()).ifPresentOrElse(owner -> {
            if (owner.superadmin()) {
                users.assign(owner.id(), legacy.id(), Role.MEMBER);
                log.info("PLATFORM login={} moved to tenant id={} as member", owner.login(), legacy.id());
            }
        }, () -> createOwnerAs(Role.MEMBER, legacy.id()));
    }

    private void createOwnerAs(Role role, @Nullable Long tenantId) {
        if (security.passwordHash() == null || security.passwordHash().isBlank()) {
            log.warn("PLATFORM ADMIN_PASSWORD_HASH is empty: login={} is not created", security.username());
            return;
        }
        users.create(tenantId, security.username(), security.passwordHash(), role, Instant.now(clock));
        log.info("PLATFORM created login={} role={} tenant={}", security.username(), role, tenantId);
    }
}
