package kz.wasender.dispatch;

import kz.wasender.request.RequestStatus;
import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = {"app.warmup.enabled=true", "app.warmup.daily-limits=50,100"})
class WarmupTest extends IntegrationTest {

    @Autowired
    WarmupService warmup;

    @Test
    void dailyLimitIsRespectedAndRemainderContinuesNextDayFromSamePosition() throws Exception {
        useGroups(120);
        var row = addValidRow("Алматы — Тараз");
        poller.poll();
        var id = requests.findAll().getFirst().id();

        runUntilBlocked(1000);

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.DAILY_LIMIT);
        assertThat(sentJids()).hasSize(50);
        assertThat(warmup.sentToday()).isEqualTo(50);
        assertThat(warmup.limitToday()).isEqualTo(50);
        assertThat(requests.find(id).orElseThrow().status()).isEqualTo(RequestStatus.SENDING);
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("Отправляется");
        assertThat(sheet.row(row).get(SheetField.PROGRESS)).isEqualTo("50/120");
        var plan = deliveries.findByRequest(id).stream().map(DeliveryRecord::groupJid).toList();
        assertThat(sentJids()).isEqualTo(plan.subList(0, 50));

        dispatcher.cycle();
        assertThat(sentJids()).hasSize(50);

        clock.set(LocalDateTime.of(2026, 9, 29, 8, 0));
        assertThat(warmup.warmupDay(warmup.today())).isEqualTo(2);
        assertThat(warmup.limitToday()).isEqualTo(100);

        runUntilBlocked(1000);

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.IDLE);
        assertThat(sentJids()).hasSize(120).doesNotHaveDuplicates().isEqualTo(plan);
        assertThat(warmup.sentToday()).isEqualTo(70);
        assertThat(requests.find(id).orElseThrow().status()).isEqualTo(RequestStatus.DONE);

        clock.set(LocalDateTime.of(2026, 9, 30, 9, 0));
        assertThat(warmup.limitToday()).isNull();
    }
}
