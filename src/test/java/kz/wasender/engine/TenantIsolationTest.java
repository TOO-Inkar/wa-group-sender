package kz.wasender.engine;

import com.zaxxer.hikari.HikariDataSource;
import kz.wasender.campaign.CampaignRepository;
import kz.wasender.campaign.CampaignService;
import kz.wasender.campaign.RepeatMode;
import kz.wasender.campaign.Schedule;
import kz.wasender.config.TenancyProperties;
import kz.wasender.group.GroupRepository;
import kz.wasender.notify.AlertService;
import kz.wasender.platform.InviteCodes;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import kz.wasender.request.RequestIntake;
import kz.wasender.settings.SettingsService;
import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import kz.wasender.web.HealthController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalTime;
import java.util.EnumMap;
import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantIsolationTest extends IntegrationTest {
    @Autowired
    TenantEngines engines;
    @Autowired
    TenantRepository tenants;
    @Autowired
    GroupRepository groups;
    @Autowired
    CampaignService campaigns;
    @Autowired
    CampaignRepository campaignRepository;
    @Autowired
    SettingsService settings;
    @Autowired
    AlertService alerts;
    @Autowired
    HealthController health;

    private Tenant second;

    @BeforeEach
    void startSecondTenant() {
        second = tenants.create("Кабинет 2", false, InviteCodes.random(), clock.instant());
        engines.start(second);
    }

    private <T> T inSecond(Supplier<T> action) {
        return CurrentTenant.callAs(second.id(), action);
    }

    private void inSecond(Runnable action) {
        inSecond(() -> {
            action.run();
            return null;
        });
    }

    private static String dbUrl(Engine engine) {
        return engine.bean(HikariDataSource.class).getJdbcUrl();
    }

    private static CampaignService.Input campaign(String route) {
        var fields = new EnumMap<SheetField, String>(SheetField.class);
        fields.put(SheetField.ROUTE, route);
        fields.put(SheetField.DATE, "Срочно");
        fields.put(SheetField.VEHICLES, "Тент 20 т");
        fields.put(SheetField.CARGO, "Мука");
        fields.put(SheetField.FREIGHT, "🔥");
        return new CampaignService.Input(new RequestIntake.Draft(List.of(fields), null, null), "{}", null, null, null,
                new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null), false);
    }

    private static SettingsService.View hourlyLimit(int limit) {
        return new SettingsService.View(null, null, null, limit, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null);
    }

    @Test
    void legacyTenantKeepsTheExistingDatabaseNameAndOthersGetTheirOwn() {
        var legacy = engines.get(1);

        assertThat(legacy.info().legacy()).isTrue();
        assertThat(dbUrl(legacy)).contains("-" + TenancyProperties.LEGACY_DB_NAME + ";");
        assertThat(dbUrl(engines.get(second.id()))).contains("-" + second.key() + ";").isNotEqualTo(dbUrl(legacy));
        assertThat(engines.running()).extracting(engine -> engine.info().id()).containsExactly(1L, second.id());
    }

    @Test
    void groupsCampaignsAndSettingsOfOneTenantAreInvisibleInAnother() {
        useGroups(3);
        campaigns.create(campaign("АЛМАТЫ → АСТАНА"));
        settings.update(hourlyLimit(77));

        assertThat(groups.activeCount()).isEqualTo(3);
        assertThat(campaignRepository.findAll()).hasSize(1);
        assertThat(settings.view().hourlyLimit()).isEqualTo(77);
        inSecond(() -> {
            assertThat(groups.activeCount()).isZero();
            assertThat(campaignRepository.findAll()).isEmpty();
            assertThat(settings.view().hourlyLimit()).isNotEqualTo(77);
            assertThat(gateway.sent()).isEmpty();
        });
    }

    @Test
    void alertsArePrefixedWithTheTenantName() {
        inSecond(() -> alerts.alert("test", "проверка"));

        assertThat(notifier.anyContains("[wa-group-sender] Кабинет 2: проверка")).isTrue();
    }

    @Test
    void healthReportsTheLegacyTenantAndCountsRunningOnes() {
        inSecond(() -> {
            gateway.connect();
            useGroups(5);
        });

        var report = health.health();

        assertThat(report.status()).isEqualTo("UP");
        assertThat(report.tenants()).isEqualTo(2);
        assertThat(inSecond(health::health).activeGroups()).isEqualTo(5);
    }

    @Test
    void stoppedEngineKeepsItsDataAndRejectsCalls() {
        inSecond(() -> {
            gateway.connect();
            useGroups(2);
        });

        engines.stop(second.id());

        assertThat(engines.find(second.id())).isEmpty();
        assertThatThrownBy(() -> inSecond(groups::activeCount)).isInstanceOf(IllegalStateException.class);
        engines.start(second);
        assertThat(inSecond(groups::activeCount)).isEqualTo(2);
    }

    @Test
    void destroyedEngineLosesItsDatabaseButTheLegacyOneCannotBeDestroyed() {
        inSecond(() -> {
            gateway.connect();
            useGroups(2);
        });

        engines.destroy(second.id());

        assertThat(engines.find(second.id())).isEmpty();
        engines.start(second);
        assertThat(inSecond(groups::activeCount)).isZero();
        assertThatThrownBy(() -> engines.destroy(1)).isInstanceOf(IllegalStateException.class);
        assertThat(engines.find(1)).isPresent();
    }
}
