package kz.wasender.dispatch;

import kz.wasender.config.WarmupProperties;
import kz.wasender.support.MutableClock;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DailyCapTest {
    private final MutableClock clock = new MutableClock(LocalDateTime.of(2026, 10, 20, 10, 0));
    private final DailyCounterRepository counters = mock(DailyCounterRepository.class);

    private WarmupService warmup(boolean enabled, int cap, int daysSinceFirstSend) {
        when(counters.firstSendDay()).thenReturn(Optional.of(clock.now().toLocalDate().minusDays(daysSinceFirstSend)));
        return new WarmupService(counters, new WarmupProperties(enabled, List.of(45, 80, 120, 170, 220), cap), clock);
    }

    @Test
    void capKeepsLimitingAfterTheWarmUp() {
        assertThat(warmup(true, 900, 30).limitToday()).isEqualTo(900);
        assertThat(warmup(true, 0, 30).limitToday()).isNull();
    }

    @Test
    void smallerOfWarmUpAndCapApplies() {
        assertThat(warmup(true, 100, 1).limitToday()).isEqualTo(80);
        assertThat(warmup(true, 60, 1).limitToday()).isEqualTo(60);
    }

    @Test
    void capWorksWithWarmUpOff() {
        assertThat(warmup(false, 900, 0).limitToday()).isEqualTo(900);
    }
}
