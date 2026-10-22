package kz.wasender.web;

import jakarta.servlet.http.HttpServletRequest;
import kz.wasender.config.SecurityProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.jspecify.annotations.Nullable;

/**
 * Страница входа: логин и пароль (bcrypt-хеш в ADMIN_PASSWORD_HASH) → cookie сессии.
 * Неудачные входы видны в логе nginx как 401 на /api/auth/login — по ним банит fail2ban; здесь ещё и свой предел на IP.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final int MAX_FAILURES = 10;
    private static final Duration FAILURE_WINDOW = Duration.ofMinutes(10);

    private final SecurityProperties properties;
    private final SessionTokens sessions;
    private final Clock clock;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final Map<String, ArrayDeque<Instant>> failures = new ConcurrentHashMap<>();

    public AuthController(SecurityProperties properties, SessionTokens sessions, Clock clock) {
        this.properties = properties;
        this.sessions = sessions;
        this.clock = clock;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Login login, HttpServletRequest request) {
        var ip = clientIp(request);
        if (tooManyFailures(ip)) {
            log.warn("LOGIN throttled ip={}", ip);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", "Слишком много попыток. Подождите 10 минут."));
        }
        if (properties.passwordHash() == null || properties.passwordHash().isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("message", "Вход по паролю не настроен (ADMIN_PASSWORD_HASH)."));
        }
        var userOk = login.username() != null && MessageDigest.isEqual(
                login.username().strip().getBytes(StandardCharsets.UTF_8), properties.username().getBytes(StandardCharsets.UTF_8));
        var passwordOk = login.password() != null && matches(login.password());
        if (!userOk || !passwordOk) {
            recordFailure(ip);
            log.warn("LOGIN failed ip={} username=\"{}\"", ip, login.username());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Неверный логин или пароль"));
        }
        failures.remove(ip);
        log.info("LOGIN ok ip={}", ip);
        var cookie = ResponseCookie.from(SessionTokens.COOKIE, sessions.issue())
                .httpOnly(true).secure(true).sameSite("Strict").path("/").maxAge(sessions.maxAgeSeconds()).build();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(Map.of("username", properties.username()));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        var cookie = ResponseCookie.from(SessionTokens.COOKIE, "").httpOnly(true).secure(true).sameSite("Strict").path("/").maxAge(0).build();
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
    }

    /** Вошёл ли браузер: страница решает, показать вход или админку. */
    @GetMapping("/me")
    public Me me(HttpServletRequest request) {
        // 200 в обоих случаях: страница входа не должна сыпать ошибками в консоль браузера.
        return AdminTokenFilter.authorized(request, properties, sessions) ? new Me(true, properties.username()) : new Me(false, null);
    }

    private boolean matches(String password) {
        try {
            return encoder.matches(password, properties.passwordHash());
        } catch (IllegalArgumentException e) {
            log.error("LOGIN ADMIN_PASSWORD_HASH is not a bcrypt hash");
            return false;
        }
    }

    private boolean tooManyFailures(String ip) {
        var list = failures.get(ip);
        if (list == null) {
            return false;
        }
        synchronized (list) {
            var cutoff = Instant.now(clock).minus(FAILURE_WINDOW);
            while (!list.isEmpty() && list.peekFirst().isBefore(cutoff)) {
                list.pollFirst();
            }
            return list.size() >= MAX_FAILURES;
        }
    }

    private void recordFailure(String ip) {
        var list = failures.computeIfAbsent(ip, key -> new ArrayDeque<>());
        synchronized (list) {
            list.addLast(Instant.now(clock));
        }
    }

    /** За nginx настоящий адрес в X-Real-IP; без nginx — адрес соединения. */
    private static String clientIp(HttpServletRequest request) {
        var real = request.getHeader("X-Real-IP");
        return real == null || real.isBlank() ? request.getRemoteAddr() : real.strip();
    }

    public record Me(boolean authenticated, @Nullable String username) {
    }

    public record Login(@Nullable String username, @Nullable String password) {
    }
}
