package kz.wasender.dispatch;

import kz.wasender.engine.TenantEngines;
import kz.wasender.platform.InviteCodes;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class PausePersistenceTest extends IntegrationTest {
    @Autowired
    TenantEngines engines;
    @Autowired
    TenantRepository tenants;

    private Tenant tenant;

    @BeforeEach
    void startTenant() {
        tenant = tenants.create("Кабинет на паузе", false, InviteCodes.random(), clock.instant());
        engines.start(tenant);
    }

    private Dispatcher tenantDispatcher() {
        return engines.get(tenant.id()).bean(Dispatcher.class);
    }

    private Dispatcher restart() {
        var before = tenantDispatcher();
        engines.stop(tenant.id());
        engines.start(tenant);
        var after = tenantDispatcher();
        assertThat(after).isNotSameAs(before);
        return after;
    }

    @Test
    void manualPauseSurvivesRestart() throws Exception {
        tenantDispatcher().pause();

        var restarted = restart();
        restarted.cycle();

        assertThat(restarted.paused()).isTrue();
        assertThat(restarted.state()).isEqualTo(DispatcherState.PAUSED);
        assertThat(dispatcher.paused()).isFalse();
    }

    @Test
    void unpauseClearsThePersistedPause() throws Exception {
        tenantDispatcher().pause();
        restart().unpause();

        var restarted = restart();
        restarted.cycle();

        assertThat(restarted.paused()).isFalse();
        assertThat(restarted.state()).isNotEqualTo(DispatcherState.PAUSED);
    }
}
