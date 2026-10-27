package kz.wasender.web;

import jakarta.servlet.http.HttpServletRequest;
import kz.wasender.config.PlatformProperties;
import kz.wasender.platform.AccessCache;
import kz.wasender.platform.Actor;
import kz.wasender.platform.AppUser;
import kz.wasender.platform.AuditAction;
import kz.wasender.platform.AuditLog;
import kz.wasender.platform.EnterCodes;
import kz.wasender.platform.Passwords;
import kz.wasender.platform.Role;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.UserRepository;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final int MAX_FAILURES = 10;
    private static final Duration FAILURE_WINDOW = Duration.ofMinutes(10);
    private static final long NO_TENANT = 0;
    private static final String HOME = "/";
    private static final String THROTTLED = "Слишком много попыток. Подождите 10 минут.";
    private static final String BAD_CREDENTIALS = "Неверный логин или пароль";
    private static final String ADMIN_ELSEWHERE = "Учётная запись администратора входит только в админку: https://%s";
    private static final String MEMBER_ELSEWHERE = "Это вход в админку. Учётные записи кабинетов входят на основном сайте";
    private static final String ACCESS_CLOSED = "Доступ закрыт: учётная запись отключена или кабинет заблокирован";

    private final Authenticator authenticator;
    private final SessionTokens sessions;
    private final UserRepository users;
    private final AccessCache access;
    private final Passwords passwords;
    private final EnterCodes enterCodes;
    private final AuditLog audit;
    private final PlatformProperties platform;
    private final CloudflareAccess cloudflare;
    private final Clock clock;
    private final FailureThrottle ipFailures;
    private final FailureThrottle loginFailures;

    public AuthController(Authenticator authenticator, SessionTokens sessions, UserRepository users, AccessCache access, Passwords passwords,
                          EnterCodes enterCodes, AuditLog audit, PlatformProperties platform, CloudflareAccess cloudflare, Clock clock) {
        this.authenticator = authenticator;
        this.sessions = sessions;
        this.users = users;
        this.access = access;
        this.passwords = passwords;
        this.enterCodes = enterCodes;
        this.audit = audit;
        this.platform = platform;
        this.cloudflare = cloudflare;
        this.clock = clock;
        this.ipFailures = new FailureThrottle(MAX_FAILURES, FAILURE_WINDOW, clock);
        this.loginFailures = new FailureThrottle(MAX_FAILURES, FAILURE_WINDOW, clock);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Login login, HttpServletRequest request) {
        if (platform.platformHost(request.getServerName()) && !cloudflare.allows(request)) {
            return message(HttpStatus.FORBIDDEN, CloudflareAccess.DENIED);
        }
        var ip = ClientIp.of(request);
        var username = login.username() == null ? "" : login.username().strip();
        var loginKey = username.toLowerCase(Locale.ROOT);
        if (ipFailures.blocked(ip) || loginFailures.blocked(loginKey)) {
            log.warn("LOGIN throttled ip={} username=\"{}\"", ip, username);
            return message(HttpStatus.TOO_MANY_REQUESTS, THROTTLED);
        }
        if (!authenticator.configured()) {
            return message(HttpStatus.SERVICE_UNAVAILABLE, "Вход не настроен (ADMIN_TOKEN).");
        }
        var user = username.isEmpty() ? null : users.findByLogin(username).orElse(null);
        if (user == null || !passwords.matches(login.password(), user.passwordHash())) {
            ipFailures.record(ip);
            loginFailures.record(loginKey);
            log.warn("LOGIN failed ip={} username=\"{}\"", ip, username);
            audit.record(null, username, ip, AuditAction.LOGIN_FAILED, user == null ? null : user.tenantId(), null);
            return message(HttpStatus.UNAUTHORIZED, BAD_CREDENTIALS);
        }
        var actor = authenticator.actor(user, user.tenantId() == null ? NO_TENANT : user.tenantId(), ip);
        if (actor.isEmpty()) {
            log.warn("LOGIN refused ip={} username=\"{}\": disabled or tenant blocked", ip, username);
            audit.record(user.id(), user.login(), ip, AuditAction.LOGIN_FAILED, user.tenantId(), "доступ закрыт");
            return message(HttpStatus.UNAUTHORIZED, ACCESS_CLOSED);
        }
        var wrongHost = wrongHost(user, request);
        if (wrongHost.isPresent()) {
            log.warn("LOGIN refused ip={} username=\"{}\": wrong host {}", ip, username, request.getServerName());
            return message(HttpStatus.FORBIDDEN, wrongHost.get());
        }
        ipFailures.reset(ip);
        loginFailures.reset(loginKey);
        users.touchLogin(user.id(), Instant.now(clock));
        audit.record(actor.get(), AuditAction.LOGIN, tenantId(actor.get()), null);
        log.info("LOGIN ok ip={} username=\"{}\"", ip, user.login());
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie(user, actor.get()).toString()).body(Me.of(actor.get()));
    }

    private Optional<String> wrongHost(AppUser user, HttpServletRequest request) {
        if (!platform.separateAdmin() || !platform.hostRestricted()) {
            return Optional.empty();
        }
        var onPlatform = platform.platformHost(request.getServerName());
        if (user.superadmin() && !onPlatform) {
            return Optional.of(ADMIN_ELSEWHERE.formatted(platform.host().strip()));
        }
        return !user.superadmin() && onPlatform ? Optional.of(MEMBER_ELSEWHERE) : Optional.empty();
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, sessions.cleared().toString()).build();
    }

    @GetMapping("/me")
    public Me me(HttpServletRequest request) {
        return authenticator.authenticate(request).map(Me::of).orElse(Me.ANONYMOUS);
    }

    @PostMapping("/password")
    public ResponseEntity<?> password(@RequestBody PasswordChange change, HttpServletRequest request) {
        var actor = authenticator.authenticate(request).filter(a -> a.userId() != null);
        if (actor.isEmpty()) {
            return message(HttpStatus.UNAUTHORIZED, "Войдите заново");
        }
        var user = users.find(actor.get().userId()).orElseThrow();
        if (!passwords.matches(change.current(), user.passwordHash())) {
            return message(HttpStatus.BAD_REQUEST, "Текущий пароль указан неверно");
        }
        users.setPassword(user.id(), passwords.hash(change.next()));
        access.invalidate();
        audit.record(actor.get(), AuditAction.PASSWORD_CHANGED, tenantId(actor.get()), null);
        var updated = users.find(user.id()).orElseThrow();
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie(updated, actor.get()).toString()).build();
    }

    @GetMapping("/enter")
    public ResponseEntity<?> enter(@RequestParam(required = false) @Nullable String code, HttpServletRequest request) {
        var ip = ClientIp.of(request);
        var actor = Optional.ofNullable(code).flatMap(enterCodes::consume)
                .flatMap(grant -> users.find(grant.userId())
                        .filter(AppUser::superadmin)
                        .flatMap(user -> authenticator.actor(user, grant.tenantId(), ip))
                        .filter(a -> a.tenant() != null && a.tenant().id() == grant.tenantId()));
        if (actor.isEmpty()) {
            log.warn("ENTER refused ip={}", ip);
            return message(HttpStatus.BAD_REQUEST, "Ссылка для входа недействительна или устарела");
        }
        var user = users.find(actor.get().userId()).orElseThrow();
        audit.record(actor.get(), AuditAction.ENTER, tenantId(actor.get()), actor.get().tenant().name());
        log.info("ENTER ok ip={} username=\"{}\" tenant={}", ip, user.login(), actor.get().tenant().id());
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, cookie(user, actor.get()).toString())
                .header(HttpHeaders.LOCATION, HOME)
                .build();
    }

    private ResponseCookie cookie(AppUser user, Actor actor) {
        return sessions.cookie(user, actor.tenant() == null ? NO_TENANT : actor.tenant().id());
    }

    private static @Nullable Long tenantId(Actor actor) {
        return actor.tenant() == null ? null : actor.tenant().id();
    }

    private static ResponseEntity<Map<String, String>> message(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }

    public record Me(boolean authenticated, @Nullable String username, @Nullable Role role, @Nullable TenantRef tenant) {
        static final Me ANONYMOUS = new Me(false, null, null, null);

        static Me of(Actor actor) {
            return new Me(true, actor.login(), actor.role(), TenantRef.of(actor.tenant()));
        }
    }

    public record TenantRef(long id, String name) {
        static @Nullable TenantRef of(@Nullable Tenant tenant) {
            return tenant == null ? null : new TenantRef(tenant.id(), tenant.name());
        }
    }

    public record Login(@Nullable String username, @Nullable String password) {
    }

    public record PasswordChange(@Nullable String current, @Nullable String next) {
    }
}
