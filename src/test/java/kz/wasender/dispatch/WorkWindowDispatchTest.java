package kz.wasender.dispatch;

import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class WorkWindowDispatchTest extends IntegrationTest {
    @Test
    void nothingIsSentOutsideWindowAndQueueWaits() throws Exception {
        useGroups(5);
        clock.set(LocalDateTime.of(2026, 9, 28, 21, 30));
        var row = addValidRow("Ночная заявка");
        poller.poll();

        for (var i = 0; i < 50; i++) {
            dispatcher.cycle();
        }
        buffer.flush();

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.OUTSIDE_WINDOW);
        assertThat(gateway.sent()).isEmpty();
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("В очереди");

        clock.set(LocalDateTime.of(2026, 9, 29, 8, 0));
        runUntilBlocked(200);

        assertThat(sentJids()).hasSize(5);
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("Отправлено");
    }

    @Test
    void sendingStopsWhenWindowClosesMidRequest() throws Exception {
        useGroups(30);
        clock.set(LocalDateTime.of(2026, 9, 28, 19, 55));
        addValidRow("Поздняя заявка");
        poller.poll();

        runUntilBlocked(500);

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.OUTSIDE_WINDOW);
        assertThat(clock.now().toLocalTime()).isAfterOrEqualTo(java.time.LocalTime.of(20, 0));
        var sentBefore = sentJids().size();
        assertThat(sentBefore).isBetween(1, 29);

        clock.set(LocalDateTime.of(2026, 9, 29, 8, 0));
        runUntilBlocked(500);
        assertThat(sentJids()).hasSize(30).doesNotHaveDuplicates();
    }
}
