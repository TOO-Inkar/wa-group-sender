package kz.wasender.web;

import kz.wasender.config.SecurityProperties;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

// Сессия без хранения на сервере: срок и HMAC ключом ADMIN_TOKEN; смена токена разлогинит всех.
@Component
public class SessionTokens {
    public static final String COOKIE = "wa_session";

    private final SecurityProperties properties;
    private final Clock clock;

    public SessionTokens(SecurityProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public String issue() {
        var expires = Instant.now(clock).plus(properties.sessionTtl()).getEpochSecond();
        return expires + "." + sign(expires);
    }

    public boolean valid(String token) {
        if (token == null || properties.adminToken() == null || properties.adminToken().isBlank()) {
            return false;
        }
        var dot = token.indexOf('.');
        if (dot <= 0) {
            return false;
        }
        long expires;
        try {
            expires = Long.parseLong(token.substring(0, dot));
        } catch (NumberFormatException e) {
            return false;
        }
        if (Instant.ofEpochSecond(expires).isBefore(Instant.now(clock))) {
            return false;
        }
        return MessageDigest.isEqual(sign(expires).getBytes(StandardCharsets.UTF_8), token.substring(dot + 1).getBytes(StandardCharsets.UTF_8));
    }

    public long maxAgeSeconds() {
        return properties.sessionTtl().toSeconds();
    }

    private String sign(long expires) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.adminToken().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            var data = "wa-session:" + properties.username() + ":" + expires;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
