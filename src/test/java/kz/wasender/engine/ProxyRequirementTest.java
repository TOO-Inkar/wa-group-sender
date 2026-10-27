package kz.wasender.engine;

import kz.wasender.platform.InviteCodes;
import kz.wasender.platform.TenantRepository;
import kz.wasender.support.IntegrationTest;
import kz.wasender.whatsapp.ProxyPolicy;
import kz.wasender.whatsapp.SessionState;
import kz.wasender.whatsapp.SessionWatchdog;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = "app.tenancy.require-proxy=true")
class ProxyRequirementTest extends IntegrationTest {
    private static final String PROXY = "socks5://user:secret@10.0.0.1:1080";

    @Autowired
    TenantEngines engines;
    @Autowired
    TenantRepository tenants;
    @Autowired
    SessionWatchdog watchdog;

    @Test
    void tenantWithoutProxyIsNotConnectedAndDoesNotRetry() {
        var second = tenants.create("Кабинет 2", false, InviteCodes.random(), clock.instant());
        engines.start(second);

        var state = CurrentTenant.callAs(second.id(), () -> {
            gateway.connect();
            watchdog.check();
            return gateway.sessionState();
        });

        assertThat(state).isEqualTo(SessionState.PROXY_REQUIRED);
        assertThat(CurrentTenant.callAs(second.id(), watchdog::attempts)).isZero();
        assertThat(gateway.sessionState()).isEqualTo(SessionState.CONNECTED);
        assertThat(notifier.messages()).isEmpty();
    }

    @Test
    void policyRequiresProxyOnlyForNonLegacyTenantsWhenEnabled() {
        var legacy = new TenantInfo(1, "t1", "Кабинет 1", true);
        var second = new TenantInfo(2, "t2", "Кабинет 2", false);
        NetworkProxies none = id -> Optional.empty();

        assertThat(new ProxyPolicy(legacy, none, true).missing()).isFalse();
        assertThat(new ProxyPolicy(second, none, true).missing()).isTrue();
        assertThat(new ProxyPolicy(second, none, false).missing()).isFalse();
        assertThat(new ProxyPolicy(second, id -> Optional.of(PROXY), true).missing()).isFalse();
        assertThat(new ProxyPolicy(second, id -> Optional.of(PROXY), true).proxy()).contains(PROXY);
    }
}
