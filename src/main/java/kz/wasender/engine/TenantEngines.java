package kz.wasender.engine;

import kz.wasender.platform.Tenant;

import java.util.Collection;
import java.util.Optional;

public interface TenantEngines {
    Engine get(long tenantId);

    Optional<Engine> find(long tenantId);

    Collection<Engine> running();

    Engine start(Tenant tenant);

    void stop(long tenantId);

    void destroy(long tenantId);
}
