package kz.wasender.platform;

import kz.wasender.engine.NetworkProxies;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class PlatformNetworkProxies implements NetworkProxies {
    private final TenantRepository tenants;

    public PlatformNetworkProxies(TenantRepository tenants) {
        this.tenants = tenants;
    }

    @Override
    public Optional<String> forTenant(long tenantId) {
        return tenants.find(tenantId).map(Tenant::proxyUrl);
    }
}
