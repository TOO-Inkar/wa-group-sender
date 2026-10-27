package kz.wasender.web;

import jakarta.servlet.http.HttpServletRequest;
import kz.wasender.config.SecurityProperties;
import kz.wasender.platform.AccessCache;
import kz.wasender.platform.Actor;
import kz.wasender.platform.AppUser;
import kz.wasender.platform.Role;
import kz.wasender.platform.Tenant;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Objects;
import java.util.Optional;

@Component
public class Authenticator {
    public static final String TENANT_HEADER = "X-Tenant";

    private final SecurityProperties properties;
    private final SessionTokens sessions;
    private final AccessCache access;

    public Authenticator(SecurityProperties properties, SessionTokens sessions, AccessCache access) {
        this.properties = properties;
        this.sessions = sessions;
        this.access = access;
    }

    public boolean configured() {
        return properties.adminToken() != null && !properties.adminToken().isBlank();
    }

    public Optional<Actor> authenticate(HttpServletRequest request) {
        if (!configured()) {
            return Optional.empty();
        }
        var ip = ClientIp.of(request);
        var provided = request.getHeader(properties.header());
        if (provided != null && MessageDigest.isEqual(properties.adminToken().getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            return Optional.of(tokenActor(request.getHeader(TENANT_HEADER), ip));
        }
        return sessions.read(request).flatMap(sessions::parse).flatMap(session -> sessionActor(session, ip));
    }

    public Optional<Actor> actor(AppUser user, long tenantId, String ip) {
        if (!user.enabled()) {
            return Optional.empty();
        }
        if (user.superadmin()) {
            var tenant = access.activeTenant(tenantId).or(access::defaultTenant).orElse(null);
            return Optional.of(new Actor(user.id(), user.login(), user.role(), tenant, ip));
        }
        if (!Objects.equals(user.tenantId(), tenantId)) {
            return Optional.empty();
        }
        return access.activeTenant(tenantId).map(tenant -> new Actor(user.id(), user.login(), user.role(), tenant, ip));
    }

    private Optional<Actor> sessionActor(SessionTokens.Session session, String ip) {
        return access.user(session.userId())
                .filter(user -> user.sessionVersion() == session.version())
                .flatMap(user -> actor(user, session.tenantId(), ip));
    }

    private Actor tokenActor(String requestedTenant, String ip) {
        var admin = access.superadmin();
        Tenant tenant = requestedTenant == null || requestedTenant.isBlank()
                ? access.defaultTenant().orElse(null)
                : parseId(requestedTenant).flatMap(access::activeTenant).orElse(null);
        return new Actor(admin.map(AppUser::id).orElse(null), admin.map(AppUser::login).orElse(properties.username()), Role.SUPERADMIN,
                tenant, ip);
    }

    private static Optional<Long> parseId(String value) {
        try {
            return Optional.of(Long.parseLong(value.strip()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}
