package kz.wasender.config;

import kz.wasender.engine.TenantInfo;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.tenancy")
public record TenancyProperties(String dbUrl, @Nullable Long defaultTenant, boolean requireProxy) {
    public static final String LEGACY_DB_NAME = "wasender";
    private static final String NAME_PLACEHOLDER = "{name}";

    public String dbUrl(TenantInfo tenant) {
        return dbUrl.replace(NAME_PLACEHOLDER, tenant.legacy() ? LEGACY_DB_NAME : tenant.key());
    }
}
