package kz.wasender.dispatch;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = "app.dispatch.weekends-enabled=false")
class WeekendFlagTest extends IntegrationTest {
    @Test
    void requestWaitsOverWeekendWhenFlagIsOff() throws Exception {
        useGroups(3);
        clock.set(LocalDateTime.of(2026, 10, 3, 12, 0));
        addValidRow("ХОРГОС → БАКУ");
        poller.poll();

        for (var i = 0; i < 20; i++) {
            dispatcher.cycle();
        }
        assertThat(dispatcher.state()).isEqualTo(DispatcherState.OUTSIDE_WINDOW);
        assertThat(gateway.sent()).isEmpty();

        clock.set(LocalDateTime.of(2026, 10, 5, 8, 0));
        runUntilBlocked(100);

        assertThat(sentJids()).hasSize(3);
    }
}
