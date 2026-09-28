package kz.wasender.dispatch;

import kz.wasender.config.DispatchProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Random;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class PauseRandomizerTest {

    private final DispatchProperties properties = new DispatchProperties(false, 25,
            Duration.ofMinutes(10), Duration.ofMinutes(20),
            Duration.ofSeconds(20), Duration.ofSeconds(60),
            Duration.ofSeconds(2), Duration.ofSeconds(6),
            Duration.ofSeconds(5), LocalTime.of(8, 0), LocalTime.of(21, 0), true);
    private final PauseRandomizer randomizer = new PauseRandomizer(properties, new Random(7));

    @Test
    void groupPausesStayInRangeAndVary() {
        var values = IntStream.range(0, 2000).mapToObj(i -> randomizer.groupPause(1.0)).toList();

        assertThat(values).allMatch(d -> d.compareTo(Duration.ofSeconds(20)) >= 0 && d.compareTo(Duration.ofSeconds(60)) <= 0);
        assertThat(new HashSet<>(values)).hasSizeGreaterThan(1500);
        var average = values.stream().mapToLong(Duration::toMillis).average().orElseThrow();
        assertThat(average).isBetween(38_000.0, 42_000.0);
    }

    @Test
    void wavePausesAndTypingStayInRange() {
        IntStream.range(0, 500).forEach(i -> {
            assertThat(randomizer.wavePause(1.0)).isBetween(Duration.ofMinutes(10), Duration.ofMinutes(20));
            assertThat(randomizer.typing()).isBetween(Duration.ofSeconds(2), Duration.ofSeconds(6));
        });
    }

    @Test
    void riskMultiplierStretchesPauses() {
        IntStream.range(0, 500).forEach(i -> {
            assertThat(randomizer.groupPause(2.0)).isBetween(Duration.ofSeconds(40), Duration.ofSeconds(120));
            assertThat(randomizer.wavePause(2.0)).isBetween(Duration.ofMinutes(20), Duration.ofMinutes(40));
        });
    }

    @Test
    void degenerateRangeReturnsMinimum() {
        assertThat(randomizer.between(Duration.ofSeconds(5), Duration.ofSeconds(5))).isEqualTo(Duration.ofSeconds(5));
        assertThat(randomizer.between(Duration.ofSeconds(5), Duration.ofSeconds(1))).isEqualTo(Duration.ofSeconds(5));
    }
}
