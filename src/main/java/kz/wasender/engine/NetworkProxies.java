package kz.wasender.engine;

import java.util.Optional;

public interface NetworkProxies {
    Optional<String> forTenant(long tenantId);
}
