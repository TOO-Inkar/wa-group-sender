package kz.wasender.tenant;

import com.zaxxer.hikari.HikariDataSource;
import kz.wasender.config.FakeProperties;
import kz.wasender.config.TenancyProperties;
import kz.wasender.config.WhatsAppProperties;
import kz.wasender.engine.TenantInfo;
import org.flywaydb.core.Flyway;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.scheduling.concurrent.CustomizableThreadFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.Objects;

@Configuration(proxyBeanMethods = false)
@Import(StartupTasks.class)
public class EngineConfig {
    private static final int DB_POOL_SIZE = 5;
    private static final int SCHEDULER_POOL_SIZE = 4;
    private static final String MIGRATIONS = "classpath:db/migration";

    @Bean(destroyMethod = "close")
    HikariDataSource dataSource(TenantInfo tenant, TenancyProperties tenancy, DataSourceProperties properties) {
        var dataSource = new HikariDataSource();
        dataSource.setPoolName(tenant.threadName("db"));
        dataSource.setJdbcUrl(tenancy.dbUrl(tenant));
        dataSource.setUsername(properties.determineUsername());
        dataSource.setPassword(properties.determinePassword());
        dataSource.setMaximumPoolSize(DB_POOL_SIZE);
        return dataSource;
    }

    @Bean
    Flyway flyway(DataSource dataSource) {
        var flyway = Flyway.configure().dataSource(dataSource).locations(MIGRATIONS).load();
        flyway.migrate();
        return flyway;
    }

    @Bean
    JdbcClient jdbcClient(DataSource dataSource, Flyway flyway) {
        return JdbcClient.create(dataSource);
    }

    @Bean
    DataSourceTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    TransactionTemplate transactionTemplate(DataSourceTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }

    @Bean
    ThreadPoolTaskScheduler appTaskScheduler(TenantInfo tenant) {
        var names = new CustomizableThreadFactory(tenant.threadName("sched") + "-");
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(SCHEDULER_POOL_SIZE);
        scheduler.setThreadFactory(task -> names.newThread(tenant.withMdc(task)));
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }

    @Bean
    @Primary
    WhatsAppProperties tenantWhatsAppProperties(ApplicationContext context, TenantInfo tenant) {
        return parent(context).getBean(WhatsAppProperties.class).forTenant(tenant);
    }

    @Bean
    @Primary
    FakeProperties tenantFakeProperties(ApplicationContext context, TenantInfo tenant) {
        return parent(context).getBean(FakeProperties.class).forTenant(tenant);
    }

    private static ApplicationContext parent(ApplicationContext context) {
        return Objects.requireNonNull(context.getParent(), "engine context has no parent");
    }
}
