package kz.wasender.dispatch;

import kz.wasender.config.WarmupProperties;
import kz.wasender.settings.SettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.function.Supplier;

@Service
public class WarmupService {

    private final DailyCounterRepository counters;
    private final Supplier<WarmupProperties> settings;
    private final Clock clock;

    @Autowired
    public WarmupService(DailyCounterRepository counters, SettingsService settings, Clock clock) {
        this.counters = counters;
        this.settings = settings::warmup;
        this.clock = clock;
    }

    public WarmupService(DailyCounterRepository counters, WarmupProperties properties, Clock clock) {
        this.counters = counters;
        this.settings = () -> properties;
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
        var properties = settings.get();
        var warmup = warmupLimitFor(day);
        var cap = properties.dailyCap() > 0 ? properties.dailyCap() : null;
        if (warmup == null) {
            return cap;
        }
        return cap == null ? warmup : Math.min(warmup, cap);
    }

    private Integer warmupLimitFor(LocalDate day) {
        var properties = settings.get();
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
