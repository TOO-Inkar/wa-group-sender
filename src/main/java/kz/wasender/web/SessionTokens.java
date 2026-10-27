package kz.wasender.web;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import kz.wasender.config.SecurityProperties;
import kz.wasender.platform.AppUser;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Component
public class SessionTokens {
    public static final String COOKIE = "wa_session";
    private static final String ALGORITHM = "HmacSHA256";
    private static final String CONTEXT = "wa-session:v2:";
    private static final Pattern FORMAT = Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)\\.([A-Za-z0-9_-]+)");

    private final SecurityProperties properties;
    private final Clock clock;

    public SessionTokens(SecurityProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public String issue(AppUser user, long tenantId) {
        var expires = Instant.now(clock).plus(properties.sessionTtl()).getEpochSecond();
        var payload = user.id() + "." + tenantId + "." + user.sessionVersion() + "." + expires;
        return payload + "." + sign(payload);
    }

    public Optional<Session> parse(String token) {
        if (token == null || properties.adminToken() == null || properties.adminToken().isBlank()) {
            return Optional.empty();
        }
        var matcher = FORMAT.matcher(token);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        var payload = token.substring(0, matcher.start(5) - 1);
        if (!MessageDigest.isEqual(sign(payload).getBytes(StandardCharsets.UTF_8), matcher.group(5).getBytes(StandardCharsets.UTF_8))) {
            return Optional.empty();
        }
        try {
            var session = new Session(Long.parseLong(matcher.group(1)), Long.parseLong(matcher.group(2)),
                    Integer.parseInt(matcher.group(3)), Long.parseLong(matcher.group(4)));
            return Instant.ofEpochSecond(session.expires()).isAfter(Instant.now(clock)) ? Optional.of(session) : Optional.empty();
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    public Optional<String> read(HttpServletRequest request) {
        var cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies).filter(cookie -> COOKIE.equals(cookie.getName())).map(Cookie::getValue).findFirst();
    }

    public ResponseCookie cookie(AppUser user, long tenantId) {
        return build(issue(user, tenantId), properties.sessionTtl().toSeconds());
    }

    public ResponseCookie cleared() {
        return build("", 0);
    }

    private static ResponseCookie build(String value, long maxAge) {
        return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(true).sameSite("Strict").path("/").maxAge(maxAge).build();
    }

    private String sign(String payload) {
        try {
            var mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(properties.adminToken().getBytes(StandardCharsets.UTF_8), ALGORITHM));
            var data = CONTEXT + payload;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public record Session(long userId, long tenantId, int version, long expires) {
    }
}
