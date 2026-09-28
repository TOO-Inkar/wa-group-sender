package kz.inkar.wasender.dispatch;

import kz.inkar.wasender.config.DispatchProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class WorkWindowTest {

    private static final ZoneId ALMATY = ZoneId.of("Asia/Almaty");

    private static WorkWindow window(LocalTime start, LocalTime end, boolean weekends) {
        var properties = new DispatchProperties(false, 25, Duration.ZERO, Duration.ZERO, Duration.ZERO, Duration.ZERO,
                Duration.ZERO, Duration.ZERO, Duration.ofSeconds(5), start, end, weekends);
        return new WorkWindow(properties, Clock.system(ALMATY));
    }

    private static boolean open(WorkWindow window, int day, int hour, int minute) {
        return window.isOpen(LocalDateTime.of(2026, 9, day, hour, minute).atZone(ALMATY));
    }

    @Test
    void daytimeWindowBoundaries() {
        var window = window(LocalTime.of(8, 0), LocalTime.of(21, 0), true);

        assertThat(open(window, 28, 7, 59)).isFalse();
        assertThat(open(window, 28, 8, 0)).isTrue();
        assertThat(open(window, 28, 20, 59)).isTrue();
        assertThat(open(window, 28, 21, 0)).isFalse();
        assertThat(open(window, 28, 23, 30)).isFalse();
    }

    @Test
    void weekendsCanBeExcluded() {
        var window = window(LocalTime.of(8, 0), LocalTime.of(21, 0), false);

        assertThat(open(window, 25, 12, 0)).isTrue();
        assertThat(open(window, 26, 12, 0)).isFalse();
        assertThat(open(window, 27, 12, 0)).isFalse();
        assertThat(open(window, 28, 12, 0)).isTrue();
    }

    @Test
    void overnightAndAlwaysOpenWindows() {
        var overnight = window(LocalTime.of(22, 0), LocalTime.of(6, 0), true);
        assertThat(open(overnight, 28, 23, 0)).isTrue();
        assertThat(open(overnight, 28, 5, 59)).isTrue();
        assertThat(open(overnight, 28, 12, 0)).isFalse();

        var always = window(LocalTime.MIDNIGHT, LocalTime.MIDNIGHT, true);
        assertThat(open(always, 28, 3, 0)).isTrue();
    }

    @Test
    void usesAlmatyTimeZone() {
        var window = window(LocalTime.of(8, 0), LocalTime.of(21, 0), true);
        var utcMorning = LocalDateTime.of(2026, 9, 28, 3, 30).atZone(ZoneId.of("UTC"));

        assertThat(window.isOpen(utcMorning.withZoneSameInstant(ALMATY))).isTrue();
    }
}
