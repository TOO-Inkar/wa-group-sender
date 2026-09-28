package kz.inkar.wasender.dispatch;

import kz.inkar.wasender.config.DispatchProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.random.RandomGenerator;

@Component
public class PauseRandomizer {

    private final DispatchProperties properties;
    private final RandomGenerator random;

    public PauseRandomizer(DispatchProperties properties, RandomGenerator random) {
        this.properties = properties;
        this.random = random;
    }

    public Duration groupPause(double multiplier) {
        return scale(between(properties.groupPauseMin(), properties.groupPauseMax()), multiplier);
    }

    public Duration wavePause(double multiplier) {
        return scale(between(properties.wavePauseMin(), properties.wavePauseMax()), multiplier);
    }

    public Duration typing() {
        return between(properties.typingMin(), properties.typingMax());
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
