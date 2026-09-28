package kz.wasender.dispatch;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = {"app.warmup.enabled=true", "app.warmup.daily-limits=45,80,120,170,220"})
class WarmupMidnightTest extends IntegrationTest {

    @Autowired
    WarmupService warmup;

    @Test
    void counterResetsAtAlmatyMidnightAndScheduleReachesFullListOnSixthDay() throws Exception {
        useGroups(60);
        addValidRow("ХОРГОС → МОСКВА");
        poller.poll();
        runUntilBlocked(1000);
        assertThat(warmup.sentToday()).isEqualTo(45);

        clock.set(LocalDateTime.of(2026, 9, 28, 23, 59, 59));
        assertThat(warmup.sentToday()).isEqualTo(45);
        assertThat(warmup.limitReached()).isTrue();

        clock.advance(Duration.ofSeconds(1));
        assertThat(clock.now()).isEqualTo(LocalDateTime.of(2026, 9, 29, 0, 0));
        assertThat(warmup.sentToday()).isZero();
        assertThat(warmup.limitReached()).isFalse();
        assertThat(warmup.limitToday()).isEqualTo(80);

        var limits = new Integer[6];
        for (var day = 0; day < 6; day++) {
            limits[day] = warmup.limitFor(warmup.today().minusDays(1).plusDays(day));
        }
        assertThat(limits).containsExactly(45, 80, 120, 170, 220, null);
    }
}
