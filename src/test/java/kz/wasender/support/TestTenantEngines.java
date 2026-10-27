package kz.wasender.support;

import kz.wasender.config.NotifyProperties;
import kz.wasender.engine.Engine;
import kz.wasender.engine.TenantEngines;
import kz.wasender.engine.TenantInfo;
import kz.wasender.notify.TelegramNotifier;
import kz.wasender.notify.TelegramSubscriberRepository;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import org.flywaydb.core.Flyway;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class TestTenantEngines implements TenantEngines {
    private final ApplicationContext root;
    private final TenantRepository tenants;
    private final NotifyProperties notify;
    private final Map<Long, Engine> running = new ConcurrentHashMap<>();
    private final List<String> events = new CopyOnWriteArrayList<>();

    public TestTenantEngines(ApplicationContext root, TenantRepository tenants, NotifyProperties notify) {
        this.root = root;
        this.tenants = tenants;
        this.notify = notify;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startActive() {
        tenants.findActive().forEach(tenant -> running.computeIfAbsent(tenant.id(), id -> create(tenant)));
    }

    public List<String> events() {
        return List.copyOf(events);
    }

    @Override
    public Engine get(long tenantId) {
        return find(tenantId).orElseThrow(() -> new IllegalStateException("engine " + tenantId + " is not running"));
    }

    @Override
    public Optional<Engine> find(long tenantId) {
        return Optional.ofNullable(running.get(tenantId));
    }

    @Override
    public Collection<Engine> running() {
        return List.copyOf(running.values());
    }

    @Override
    public Engine start(Tenant tenant) {
        events.add("start:" + tenant.id());
        return running.computeIfAbsent(tenant.id(), id -> create(tenant));
    }

    @Override
    public void stop(long tenantId) {
        events.add("stop:" + tenantId);
        running.remove(tenantId);
    }

    @Override
    public void destroy(long tenantId) {
        events.add("destroy:" + tenantId);
        running.remove(tenantId);
    }

    private Engine create(Tenant tenant) {
        var info = new TenantInfo(tenant.id(), tenant.key(), tenant.name(), tenant.legacy());
        return tenant.legacy() ? new RootEngine(info, root) : new IsolatedEngine(info, root, notify);
    }

    private record RootEngine(TenantInfo info, ApplicationContext root) implements Engine {
        @Override
        public <T> T bean(Class<T> type) {
            return root.getBean(type);
        }
    }

    private static final class IsolatedEngine implements Engine {
        private final TenantInfo info;
        private final ApplicationContext root;
        private final Map<Class<?>, Object> own;

        IsolatedEngine(TenantInfo info, ApplicationContext root, NotifyProperties notify) {
            this.info = info;
            this.root = root;
            var dataSource = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + "-" + info.key() + ";DB_CLOSE_DELAY=-1");
            Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
            var subscribers = new TelegramSubscriberRepository(JdbcClient.create(dataSource));
            this.own = Map.of(TelegramSubscriberRepository.class, subscribers,
                    TelegramNotifier.class, new TelegramNotifier(notify, subscribers));
        }

        @Override
        public TenantInfo info() {
            return info;
        }

        @Override
        public <T> T bean(Class<T> type) {
            var bean = own.get(type);
            return bean == null ? root.getBean(type) : type.cast(bean);
        }
    }
}
