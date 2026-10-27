package kz.wasender.platform;

import kz.wasender.config.SecurityProperties;
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
    private final Clock clock;

    public PlatformBootstrap(TenantRepository tenants, UserRepository users, SecurityProperties security, Clock clock) {
        this.tenants = tenants;
        this.users = users;
        this.security = security;
        this.clock = clock;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (tenants.findAll().isEmpty()) {
            var tenant = tenants.create(LEGACY_TENANT_NAME, true, InviteCodes.random(), Instant.now(clock));
            log.info("PLATFORM created legacy tenant id={}", tenant.id());
        }
        if (users.count() == 0) {
            if (security.passwordHash() == null || security.passwordHash().isBlank()) {
                log.warn("PLATFORM no users and ADMIN_PASSWORD_HASH is empty: password login is unavailable");
                return;
            }
            users.create(null, security.username(), security.passwordHash(), Role.SUPERADMIN, Instant.now(clock));
            log.info("PLATFORM created superadmin login={}", security.username());
        }
    }
}
