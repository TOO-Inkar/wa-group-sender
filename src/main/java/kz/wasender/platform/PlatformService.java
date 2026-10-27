package kz.wasender.platform;

import kz.wasender.config.PlatformProperties;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.dispatch.WarmupService;
import kz.wasender.engine.Engine;
import kz.wasender.engine.TenantEngines;
import kz.wasender.group.GroupRepository;
import kz.wasender.request.RequestRepository;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.whatsapp.WhatsAppGateway;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

@Service
public class PlatformService {
    public static final int DEFAULT_AUDIT_LIMIT = 100;
    private static final int MAX_AUDIT_LIMIT = 500;
    private static final int MAX_NAME_LENGTH = 100;
    private static final Duration STATS_TTL = Duration.ofSeconds(10);
    private static final Pattern LOGIN = Pattern.compile("[A-Za-z0-9._@-]{3,64}");
    private static final Logger log = LoggerFactory.getLogger(PlatformService.class);

    private final TenantRepository tenants;
    private final UserRepository users;
    private final AuditLog audit;
    private final TenantEngines engines;
    private final AccessCache access;
    private final Passwords passwords;
    private final EnterCodes enterCodes;
    private final PlatformProperties properties;
    private final boolean requireProxy;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final TtlCache<Long, TenantStats> stats;

    public PlatformService(TenantRepository tenants, UserRepository users, AuditLog audit, TenantEngines engines, AccessCache access,
                           Passwords passwords, EnterCodes enterCodes, PlatformProperties properties,
                           @Value("${app.tenancy.require-proxy:true}") boolean requireProxy, TransactionTemplate transactions,
                           Clock clock) {
        this.tenants = tenants;
        this.users = users;
        this.audit = audit;
        this.engines = engines;
        this.access = access;
        this.passwords = passwords;
        this.enterCodes = enterCodes;
        this.properties = properties;
        this.requireProxy = requireProxy;
        this.transactions = transactions;
        this.clock = clock;
        this.stats = new TtlCache<>(STATS_TTL, clock);
    }

    public List<TenantOverview> overview() {
        var counts = users.countByTenant();
        return tenants.findAll().stream().map(tenant -> overview(tenant, counts.getOrDefault(tenant.id(), 0))).toList();
    }

    public TenantOverview overview(long id) {
        var tenant = tenant(id);
        return overview(tenant, users.findByTenant(id).size());
    }

    public TenantOverview create(Actor actor, @Nullable String name, @Nullable String login, @Nullable String password,
                                 @Nullable String proxy) {
        var tenantName = validName(name, 0);
        var userLogin = validLogin(login);
        var hash = passwords.hash(password);
        var proxyUrl = ProxyUrls.normalize(proxy);
        var now = Instant.now(clock);
        var tenant = Objects.requireNonNull(transactions.execute(tx -> {
            var created = tenants.create(tenantName, false, InviteCodes.random(), now, proxyUrl);
            users.create(created.id(), userLogin, hash, Role.MEMBER, now);
            return created;
        }));
        audit.record(actor, AuditAction.TENANT_CREATED, tenant.id(), tenantName + (proxyUrl == null ? "" : ", прокси " + ProxyUrls.mask(proxyUrl)));
        audit.record(actor, AuditAction.USER_CREATED, tenant.id(), userLogin);
        access.invalidate();
        engines.start(tenant);
        log.info("PLATFORM tenant created id={} by {}", tenant.id(), actor.login());
        return overview(tenant, 1);
    }

    public TenantOverview update(Actor actor, long id, TenantChange change) {
        var tenant = tenant(id);
        var name = change.name() == null ? tenant.name() : validName(change.name(), id);
        var proxyUrl = change.proxyPresent() ? ProxyUrls.normalize(change.proxy()) : tenant.proxyUrl();
        var status = change.status() == null ? tenant.status() : validStatus(change.status());
        if (!name.equals(tenant.name())) {
            tenants.rename(id, name);
            audit.record(actor, AuditAction.TENANT_RENAMED, id, tenant.name() + " → " + name);
        }
        var proxyChanged = !Objects.equals(proxyUrl, tenant.proxyUrl());
        if (proxyChanged) {
            tenants.setProxy(id, proxyUrl);
            audit.record(actor, AuditAction.PROXY_CHANGED, id, Objects.requireNonNullElse(ProxyUrls.mask(proxyUrl), "без прокси"));
        }
        if (status != tenant.status()) {
            tenants.setStatus(id, status);
        }
        access.invalidate();
        stats.invalidate(id);
        if (status != tenant.status()) {
            if (status == TenantStatus.BLOCKED) {
                engines.stop(id);
                audit.record(actor, AuditAction.TENANT_BLOCKED, id, null);
            } else {
                engines.start(tenant(id));
                audit.record(actor, AuditAction.TENANT_UNBLOCKED, id, null);
            }
        } else if (proxyChanged && status == TenantStatus.ACTIVE) {
            reconnect(id);
        }
        return overview(id);
    }

    public void delete(Actor actor, long id, @Nullable String confirmName) {
        var tenant = tenant(id);
        if (tenant.legacy()) {
            throw new ConflictException("Основной кабинет удалить нельзя");
        }
        if (confirmName == null || !confirmName.strip().equals(tenant.name())) {
            throw new IllegalArgumentException("Название для подтверждения не совпадает с названием кабинета");
        }
        engines.destroy(id);
        tenants.delete(id);
        audit.record(actor, AuditAction.TENANT_DELETED, id, tenant.name());
        access.invalidate();
        stats.invalidate(id);
        log.info("PLATFORM tenant deleted id={} by {}", id, actor.login());
    }

    public List<PlatformUser> users(long tenantId) {
        tenant(tenantId);
        return users.findByTenant(tenantId).stream().map(PlatformUser::of).toList();
    }

    public PlatformUser createUser(Actor actor, long tenantId, @Nullable String login, @Nullable String password) {
        tenant(tenantId);
        var userLogin = validLogin(login);
        var user = users.create(tenantId, userLogin, passwords.hash(password), Role.MEMBER, Instant.now(clock));
        audit.record(actor, AuditAction.USER_CREATED, tenantId, userLogin);
        return PlatformUser.of(user);
    }

    public PlatformUser updateUser(Actor actor, long id, @Nullable Boolean enabled, @Nullable String password) {
        var user = member(id);
        var changes = new ArrayList<String>();
        if (password != null) {
            users.setPassword(id, passwords.hash(password));
            changes.add("пароль");
        }
        if (enabled != null && enabled != user.enabled()) {
            users.setEnabled(id, enabled);
            changes.add(enabled ? "включён" : "отключён");
        }
        if (!changes.isEmpty()) {
            audit.record(actor, AuditAction.USER_UPDATED, user.tenantId(), user.login() + ": " + String.join(", ", changes));
            access.invalidate();
        }
        return PlatformUser.of(users.find(id).orElseThrow());
    }

    public void deleteUser(Actor actor, long id) {
        var user = member(id);
        users.delete(id);
        audit.record(actor, AuditAction.USER_DELETED, user.tenantId(), user.login());
        access.invalidate();
    }

    public String enter(Actor actor, long tenantId) {
        var tenant = tenant(tenantId);
        if (tenant.status() != TenantStatus.ACTIVE) {
            throw new ConflictException("Кабинет заблокирован");
        }
        if (actor.userId() == null) {
            throw new ConflictException("Нет учётной записи суперадмина для входа");
        }
        return properties.enterUrl(enterCodes.issue(actor.userId(), tenantId));
    }

    public List<AuditEntry> audit(@Nullable Long tenantId, @Nullable Integer limit) {
        var size = limit == null ? DEFAULT_AUDIT_LIMIT : Math.clamp(limit, 1, MAX_AUDIT_LIMIT);
        return audit.recent(tenantId, size);
    }

    private TenantOverview overview(Tenant tenant, int userCount) {
        return TenantOverview.of(tenant, userCount, stats(tenant), requireProxy && !tenant.legacy());
    }

    private TenantStats stats(Tenant tenant) {
        if (tenant.status() != TenantStatus.ACTIVE) {
            return TenantStats.STOPPED;
        }
        return stats.get(tenant.id(), id -> engines.find(id).map(engine -> read(id, engine)).orElse(TenantStats.STOPPED));
    }

    private static TenantStats read(long id, Engine engine) {
        try {
            var dispatcher = engine.bean(Dispatcher.class);
            return new TenantStats(
                    engine.bean(WhatsAppGateway.class).sessionState().name(),
                    null,
                    dispatcher.state().label(),
                    engine.bean(GroupRepository.class).activeCount(),
                    engine.bean(WarmupService.class).sentToday(),
                    dispatcher.sentLastHour(),
                    engine.bean(RequestRepository.class).queueLength(),
                    engine.bean(RiskMonitor.class).isStopped());
        } catch (RuntimeException e) {
            log.warn("PLATFORM stats for tenant {} unavailable: {}", id, e.toString());
            return TenantStats.STOPPED;
        }
    }

    private void reconnect(long id) {
        engines.find(id).ifPresent(engine -> {
            var gateway = engine.bean(WhatsAppGateway.class);
            gateway.disconnect();
            gateway.connect();
            log.info("PLATFORM tenant {} reconnected after proxy change", id);
        });
    }

    private Tenant tenant(long id) {
        return tenants.find(id).orElseThrow(() -> new NotFoundException("Кабинет не найден"));
    }

    private AppUser member(long id) {
        return users.find(id).filter(user -> user.role() == Role.MEMBER)
                .orElseThrow(() -> new NotFoundException("Пользователь не найден"));
    }

    private String validName(@Nullable String raw, long exceptId) {
        var name = raw == null ? "" : raw.strip();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Укажите название кабинета");
        }
        if (name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Название кабинета — не длиннее " + MAX_NAME_LENGTH + " символов");
        }
        if (tenants.nameTaken(name, exceptId)) {
            throw new ConflictException("Кабинет с таким названием уже есть");
        }
        return name;
    }

    private String validLogin(@Nullable String raw) {
        var login = raw == null ? "" : raw.strip();
        if (!LOGIN.matcher(login).matches()) {
            throw new IllegalArgumentException("Логин — от 3 до 64 символов: латинские буквы, цифры, точка, дефис, подчёркивание, @");
        }
        if (users.loginTaken(login)) {
            throw new ConflictException("Логин уже занят");
        }
        return login;
    }

    private static TenantStatus validStatus(String raw) {
        try {
            return TenantStatus.valueOf(raw.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Статус кабинета: ACTIVE или BLOCKED");
        }
    }

    public record TenantChange(@Nullable String name, @Nullable String status, boolean proxyPresent, @Nullable String proxy) {
    }

    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    public static class ConflictException extends RuntimeException {
        public ConflictException(String message) {
            super(message);
        }
    }
}
