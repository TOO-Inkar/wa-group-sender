package kz.wasender.campaign;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScheduleTest {
    private static final ZoneId ALMATY = ZoneId.of("Asia/Almaty");
    private static final LocalTime WINDOW_END = LocalTime.of(23, 0);

    private static ZonedDateTime at(int day, int hour, int minute) {
        return LocalDateTime.of(2026, 9, day, hour, minute).atZone(ALMATY);
    }

    private static ZonedDateTime oct(int day, int hour, int minute) {
        return LocalDateTime.of(2026, 10, day, hour, minute).atZone(ALMATY);
    }

    @Test
    void dailyRunsAtItsStartTimeEveryDay() {
        var daily = new Schedule(RepeatMode.DAILY, LocalTime.of(5, 0), null, null);

        assertThat(daily.first(at(28, 3, 0), WINDOW_END, true)).isEqualTo(at(28, 5, 0));
        assertThat(daily.first(at(28, 10, 0), WINDOW_END, true)).isEqualTo(at(29, 5, 0));
        assertThat(daily.nextAfter(at(29, 5, 0), WINDOW_END, true)).isEqualTo(at(30, 5, 0));
    }

    @Test
    void intervalRepeatsUntilEndThenStartsNextDay() {
        var hourly = new Schedule(RepeatMode.INTERVAL, LocalTime.of(5, 0), LocalTime.of(23, 0), 60);

        assertThat(hourly.first(at(28, 10, 30), WINDOW_END, true)).isEqualTo(at(28, 11, 0));
        assertThat(hourly.nextAfter(at(28, 11, 0), WINDOW_END, true)).isEqualTo(at(28, 12, 0));
        assertThat(hourly.nextAfter(at(28, 22, 0), WINDOW_END, true)).isEqualTo(at(28, 23, 0));
        assertThat(hourly.nextAfter(at(28, 23, 0), WINDOW_END, true)).isEqualTo(at(29, 5, 0));
        assertThat(hourly.nextAfter(at(28, 2, 0), WINDOW_END, true)).isEqualTo(at(28, 5, 0));
    }

    @Test
    void intervalWithoutOwnEndStopsAtTheCommonWindowEnd() {
        var everyTwoHours = new Schedule(RepeatMode.INTERVAL, LocalTime.of(8, 0), null, 120);

        assertThat(everyTwoHours.nextAfter(at(28, 20, 0), LocalTime.of(21, 0), true)).isEqualTo(at(29, 8, 0));
        assertThat(everyTwoHours.nextAfter(at(28, 19, 0), LocalTime.of(21, 0), true)).isEqualTo(at(28, 20, 0));
    }

    @Test
    void weekendsAreSkippedWhenDisabled() {
        var daily = new Schedule(RepeatMode.DAILY, LocalTime.of(5, 0), null, null);

        assertThat(daily.nextAfter(oct(2, 5, 0), WINDOW_END, false)).isEqualTo(oct(5, 5, 0));
        assertThat(daily.nextAfter(oct(2, 5, 0), WINDOW_END, true)).isEqualTo(oct(3, 5, 0));
    }

    @Test
    void onceRunsNowOrAtItsTimeAndNeverAgain() {
        var now = new Schedule(RepeatMode.ONCE, null, null, null);
        var later = new Schedule(RepeatMode.ONCE, LocalTime.of(15, 0), null, null);

        assertThat(now.first(at(28, 10, 0), WINDOW_END, true)).isEqualTo(at(28, 10, 0));
        assertThat(later.first(at(28, 10, 0), WINDOW_END, true)).isEqualTo(at(28, 15, 0));
        assertThat(later.first(at(28, 16, 0), WINDOW_END, true)).isEqualTo(at(29, 15, 0));
        assertThat(now.nextAfter(at(28, 10, 0), WINDOW_END, true)).isNull();
    }

    @Test
    void tooFrequentOrInconsistentSchedulesAreRejected() {
        assertThatThrownBy(() -> new Schedule(RepeatMode.INTERVAL, LocalTime.of(5, 0), null, 10)).hasMessageContaining("30 минут");
        assertThatThrownBy(() -> new Schedule(RepeatMode.INTERVAL, LocalTime.of(10, 0), LocalTime.of(9, 0), 60)).hasMessageContaining("позже");
        assertThatThrownBy(() -> new Schedule(RepeatMode.DAILY, null, null, null)).hasMessageContaining("время первой отправки");
    }

    @Test
    void extraTimeAddsOneMoreRunToTheDay() {
        var hourly = new Schedule(RepeatMode.INTERVAL, LocalTime.of(8, 0), LocalTime.of(23, 0), 60, List.of(LocalTime.of(5, 0)), false);

        assertThat(hourly.nextAfter(at(28, 23, 0), WINDOW_END, true)).isEqualTo(at(29, 5, 0));
        assertThat(hourly.nextAfter(at(29, 5, 0), WINDOW_END, true)).isEqualTo(at(29, 8, 0));
        assertThat(hourly.first(at(28, 4, 0), WINDOW_END, true)).isEqualTo(at(28, 5, 0));
        assertThat(hourly.windowStart()).isEqualTo(LocalTime.of(5, 0));
        assertThat(hourly.windowEnd()).isEqualTo(LocalTime.of(23, 0));
    }

    @Test
    void extraTimesSkipWeekendsLikeTheMainTime() {
        var daily = new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null, List.of(LocalTime.of(5, 0)), false);

        assertThat(daily.nextAfter(oct(2, 9, 0), WINDOW_END, false)).isEqualTo(oct(5, 5, 0));
    }

    @Test
    void anyTimeOpensTheWindowAroundTheClock() {
        var now = new Schedule(RepeatMode.ONCE, null, null, null, List.of(), true);

        assertThat(now.windowStart()).isEqualTo(now.windowEnd()).isEqualTo(LocalTime.MIDNIGHT);
        assertThat(new Schedule(RepeatMode.ONCE, null, null, null).windowStart()).isNull();
    }

    @Test
    void extraTimesAreValidated() {
        var at = List.of(LocalTime.of(5, 0));
        assertThatThrownBy(() -> new Schedule(RepeatMode.ONCE, LocalTime.of(9, 0), null, null, at, false)).hasMessageContaining("повторяющейся");
        assertThatThrownBy(() -> new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null,
                List.of(LocalTime.of(1, 0), LocalTime.of(2, 0), LocalTime.of(3, 0), LocalTime.of(4, 0)), false)).hasMessageContaining("не больше 3");
        var late = new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null, List.of(LocalTime.of(23, 30)), false);
        assertThatThrownBy(() -> late.requireExtraTimesBefore(WINDOW_END)).hasMessageContaining("вне рабочего окна");
        new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null, List.of(LocalTime.of(23, 30)), true).requireExtraTimesBefore(WINDOW_END);
    }
}
