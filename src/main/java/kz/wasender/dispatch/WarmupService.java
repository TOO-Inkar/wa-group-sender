package kz.wasender.dispatch;

import kz.wasender.config.WarmupProperties;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

@Service
public class WarmupService {

    private final DailyCounterRepository counters;
    private final WarmupProperties properties;
    private final Clock clock;

    public WarmupService(DailyCounterRepository counters, WarmupProperties properties, Clock clock) {
        this.counters = counters;
        this.properties = properties;
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.now(clock);
    }

    public int warmupDay(LocalDate day) {
        var first = counters.firstSendDay().orElse(day);
        return (int) Math.max(0, ChronoUnit.DAYS.between(first, day)) + 1;
    }

    public Integer limitFor(LocalDate day) {
        if (!properties.enabled() || properties.dailyLimits() == null || properties.dailyLimits().isEmpty()) {
            return null;
        }
        var index = warmupDay(day) - 1;
        return index < properties.dailyLimits().size() ? properties.dailyLimits().get(index) : null;
    }

    public int sentToday() {
        return counters.sent(today());
    }

    public Integer limitToday() {
        return limitFor(today());
    }

    public boolean limitReached() {
        var limit = limitToday();
        return limit != null && sentToday() >= limit;
    }

    public void registerAttempt() {
        var day = today();
        counters.increment(day, limitFor(day));
    }
}
