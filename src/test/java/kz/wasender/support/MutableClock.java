package kz.wasender.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

public class MutableClock extends Clock {
    public static final ZoneId ALMATY = ZoneId.of("Asia/Almaty");

    private volatile Instant instant;

    public MutableClock(LocalDateTime start) {
        set(start);
    }

    public void set(LocalDateTime localDateTime) {
        instant = localDateTime.atZone(ALMATY).toInstant();
    }

    public void advance(Duration duration) {
        instant = instant.plus(duration);
    }

    public LocalDateTime now() {
        return LocalDateTime.ofInstant(instant, ALMATY);
    }

    @Override
    public ZoneId getZone() {
        return ALMATY;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return Clock.fixed(instant, zone);
    }

    @Override
    public Instant instant() {
        return instant;
    }
}
