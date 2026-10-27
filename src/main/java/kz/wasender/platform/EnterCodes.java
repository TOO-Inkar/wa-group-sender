package kz.wasender.platform;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class EnterCodes {
    public static final Duration TTL = Duration.ofSeconds(60);

    private final Clock clock;
    private final Map<String, Grant> grants = new ConcurrentHashMap<>();

    public EnterCodes(Clock clock) {
        this.clock = clock;
    }

    public String issue(long userId, long tenantId) {
        var now = Instant.now(clock);
        grants.values().removeIf(grant -> !grant.expires().isAfter(now));
        var code = InviteCodes.random();
        grants.put(code, new Grant(userId, tenantId, now.plus(TTL)));
        return code;
    }

    public Optional<Grant> consume(String code) {
        return Optional.ofNullable(grants.remove(code)).filter(grant -> grant.expires().isAfter(Instant.now(clock)));
    }

    public record Grant(long userId, long tenantId, Instant expires) {
    }
}
