package kz.wasender.support;

import kz.wasender.config.NotifyProperties;
import kz.wasender.platform.TenantRepository;
import org.flywaydb.core.Flyway;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.random.RandomGenerator;

@TestConfiguration(proxyBeanMethods = false)
public class TestBeans {
    public static final LocalDateTime MONDAY_10 = LocalDateTime.of(2026, 9, 28, 10, 0);

    @Bean
    @Primary
    MutableClock mutableClock() {
        return new MutableClock(MONDAY_10);
    }

    @Bean
    @Primary
    FakeSleeper fakeSleeper(MutableClock clock) {
        return new FakeSleeper(clock);
    }

    @Bean
    @Primary
    RandomGenerator seededRandom() {
        return new Random(20260928L);
    }

    @Bean
    RecordingNotifier recordingNotifier() {
        return new RecordingNotifier();
    }

    @Bean
    TestTenantEngines testTenantEngines(ApplicationContext context, TenantRepository tenants, NotifyProperties notify) {
        return new TestTenantEngines(context, tenants, notify);
    }

    @Bean
    FlywayMigrationStrategy platformSchemaAlongsideTenantSchema() {
        return flyway -> {
            flyway.migrate();
            Flyway.configure()
                    .dataSource(flyway.getConfiguration().getDataSource())
                    .locations("classpath:db/platform")
                    .table("platform_schema_history")
                    .baselineOnMigrate(true)
                    .baselineVersion("0")
                    .load()
                    .migrate();
        };
    }
}
