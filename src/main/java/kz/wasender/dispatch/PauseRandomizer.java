package kz.wasender.dispatch;

import kz.wasender.config.DispatchProperties;
import kz.wasender.settings.SettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.function.Supplier;
import java.util.random.RandomGenerator;

@Component
public class PauseRandomizer {

    private final Supplier<DispatchProperties> properties;
    private final RandomGenerator random;

    @Autowired
    public PauseRandomizer(SettingsService settings, RandomGenerator random) {
        this.properties = settings::dispatch;
        this.random = random;
    }

    public PauseRandomizer(DispatchProperties properties, RandomGenerator random) {
        this.properties = () -> properties;
        this.random = random;
    }

    public Duration groupPause(double multiplier) {
        var p = properties.get();
        return scale(between(p.groupPauseMin(), p.groupPauseMax()), multiplier);
    }

    public Duration wavePause(double multiplier) {
        var p = properties.get();
        return scale(between(p.wavePauseMin(), p.wavePauseMax()), multiplier);
    }

    public Duration typing() {
        var p = properties.get();
        return between(p.typingMin(), p.typingMax());
    }

    public int waveSize() {
        return Math.max(1, properties.get().waveSize());
    }

    Duration between(Duration min, Duration max) {
        var low = min.toMillis();
        var high = max.toMillis();
        if (high <= low) {
            return min;
        }
        return Duration.ofMillis(random.nextLong(low, high + 1));
    }

    private static Duration scale(Duration duration, double multiplier) {
        return multiplier == 1.0 ? duration : Duration.ofMillis(Math.round(duration.toMillis() * multiplier));
    }
}
