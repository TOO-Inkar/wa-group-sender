package kz.wasender.engine;

import kz.wasender.config.TenancyProperties;
import kz.wasender.config.WhatsAppProperties;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import kz.wasender.tenant.EngineConfig;
import kz.wasender.tenant.StartupTasks;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.stereotype.Component;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Collection;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class EngineRegistry implements TenantEngines, DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(EngineRegistry.class);
    private static final String DROP_DATABASE = "drop all objects delete files";

    private final ConfigurableApplicationContext root;
    private final ConfigurableEnvironment environment;
    private final TenancyProperties tenancy;
    private final TenantRepository tenants;
    private final DataSourceProperties dataSource;
    private final WhatsAppProperties whatsApp;
    private final Map<Long, ContextEngine> engines = new ConcurrentHashMap<>();

    public EngineRegistry(ConfigurableApplicationContext root, ConfigurableEnvironment environment, TenancyProperties tenancy,
                          TenantRepository tenants, DataSourceProperties dataSource, WhatsAppProperties whatsApp) {
        this.root = root;
        this.environment = environment;
        this.tenancy = tenancy;
        this.tenants = tenants;
        this.dataSource = dataSource;
        this.whatsApp = whatsApp;
    }

    @Override
    public Engine get(long tenantId) {
        return find(tenantId).orElseThrow(() -> new EngineUnavailableException("Кабинет " + tenantId + " не запущен"));
    }

    @Override
    public Optional<Engine> find(long tenantId) {
        return Optional.ofNullable(engines.get(tenantId));
    }

    @Override
    public Collection<Engine> running() {
        return engines.values().stream().<Engine>map(engine -> engine)
                .sorted(Comparator.comparing((Engine engine) -> !engine.info().legacy()).thenComparingLong(engine -> engine.info().id()))
                .toList();
    }

    @Override
    public synchronized Engine start(Tenant tenant) {
        var existing = engines.get(tenant.id());
        if (existing != null) {
            return existing;
        }
        var info = info(tenant);
        log.info("ENGINE starting tenant={} name=\"{}\" legacy={}", info.key(), info.name(), info.legacy());
        var context = new AnnotationConfigApplicationContext();
        context.setId(root.getId() + "-" + info.key());
        context.setEnvironment(environment);
        context.setParent(root);
        context.registerBean(TenantInfo.class, () -> info);
        context.register(EngineConfig.class);
        EngineComponents.scan(context, environment);
        try {
            context.refresh();
            var engine = new ContextEngine(info, context);
            engines.put(info.id(), engine);
            context.getBean(StartupTasks.class).start();
            return engine;
        } catch (RuntimeException e) {
            engines.remove(info.id());
            context.close();
            throw e;
        }
    }

    @Override
    public synchronized void stop(long tenantId) {
        var engine = engines.remove(tenantId);
        if (engine != null) {
            log.info("ENGINE stopping tenant={}", engine.info().key());
            engine.context().close();
        }
    }

    @Override
    public synchronized void destroy(long tenantId) {
        var info = Optional.ofNullable(engines.get(tenantId)).map(ContextEngine::info)
                .or(() -> tenants.find(tenantId).map(EngineRegistry::info))
                .orElseThrow(() -> new IllegalArgumentException("Кабинет " + tenantId + " не найден"));
        if (info.legacy()) {
            throw new IllegalStateException("Основной кабинет удалить нельзя");
        }
        var engine = engines.get(tenantId);
        if (engine != null) {
            engine.bean(JdbcClient.class).sql(DROP_DATABASE).update();
            stop(tenantId);
        } else {
            dropDatabase(info);
        }
        deleteFiles(info);
        log.info("ENGINE destroyed tenant={}", info.key());
    }

    @Override
    public void destroy() {
        engines.keySet().forEach(this::stop);
    }

    Engine current() {
        return CurrentTenant.get().or(() -> Optional.ofNullable(tenancy.defaultTenant()))
                .map(this::get)
                .orElseThrow(() -> new EngineUnavailableException("Кабинет не выбран"));
    }

    private void dropDatabase(TenantInfo info) {
        var connection = new SingleConnectionDataSource(tenancy.dbUrl(info), dataSource.determineUsername(),
                dataSource.determinePassword(), false);
        try {
            JdbcClient.create(connection).sql(DROP_DATABASE).update();
        } finally {
            connection.destroy();
        }
    }

    private void deleteFiles(TenantInfo info) {
        var paths = whatsApp.forTenant(info);
        delete(paths.pictureDir());
        delete(paths.qrPngPath().getParent());
    }

    private static void delete(Path path) {
        try {
            FileSystemUtils.deleteRecursively(path);
        } catch (IOException e) {
            log.warn("Cannot delete {}: {}", path, e.toString());
        }
    }

    private static TenantInfo info(Tenant tenant) {
        return new TenantInfo(tenant.id(), tenant.key(), tenant.name(), tenant.legacy());
    }

    private record ContextEngine(TenantInfo info, AnnotationConfigApplicationContext context, Map<Class<?>, Object> beans)
            implements Engine {
        ContextEngine(TenantInfo info, AnnotationConfigApplicationContext context) {
            this(info, context, new ConcurrentHashMap<>());
        }

        @Override
        public <T> T bean(Class<T> type) {
            return type.cast(beans.computeIfAbsent(type, context::getBean));
        }
    }
}
