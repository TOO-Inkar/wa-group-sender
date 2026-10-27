package kz.wasender.whatsapp;

import kz.wasender.config.TenancyProperties;
import kz.wasender.engine.NetworkProxies;
import kz.wasender.engine.TenantInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class ProxyPolicy {
    public static final String MISSING = "Не задан прокси для номера";

    private final TenantInfo tenant;
    private final NetworkProxies proxies;
    private final boolean required;

    @Autowired
    public ProxyPolicy(TenantInfo tenant, NetworkProxies proxies, TenancyProperties tenancy) {
        this(tenant, proxies, tenancy.requireProxy());
    }

    public ProxyPolicy(TenantInfo tenant, NetworkProxies proxies, boolean required) {
        this.tenant = tenant;
        this.proxies = proxies;
        this.required = required;
    }

    public Optional<String> proxy() {
        return proxies.forTenant(tenant.id());
    }

    public boolean missing() {
        return required && !tenant.legacy() && proxy().isEmpty();
    }
}
