package kz.wasender.dispatch;

import kz.wasender.request.RequestStatus;
import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.HashSet;

import static org.assertj.core.api.Assertions.assertThat;

class DispatcherFlowTest extends IntegrationTest {

    @Test
    void requestFromSheetReachesOnlyActiveArchivedGroups() throws Exception {
        var sync = groupSync.sync();
        assertThat(sync.total()).isEqualTo(30);
        assertThat(sync.archived()).isEqualTo(27);
        assertThat(sync.active()).isEqualTo(25);

        var row = addValidRow("АЛМАТЫ → ШЫМКЕНТ");
        assertThat(poller.poll()).isEqualTo(1);
        buffer.flush();
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("В очереди");
        var id = sheet.row(row).get(SheetField.ID);
        assertThat(id).isEqualTo("1");

        runUntilBlocked(500);

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.IDLE);
        assertThat(sentJids()).hasSize(25).doesNotHaveDuplicates();
        assertThat(sentJids()).allMatch(jid -> jid.compareTo("120363000000006@g.us") >= 0);
        assertThat(gateway.sent()).allMatch(message -> message.text().startsWith("📍*АЛМАТЫ → ШЫМКЕНТ*") && message.text().contains("⚖️"));
        assertThat(gateway.typing()).hasSize(25);
        var finalRow = sheet.row(row);
        assertThat(finalRow.get(SheetField.STATUS)).isEqualTo("Отправлено");
        assertThat(finalRow.get(SheetField.PROGRESS)).isEqualTo("25 / 25");
        assertThat(finalRow.get(SheetField.COMPLETED)).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}");
        assertThat(requests.find(id).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void pausesAreRandomWithinRangesAndWavesAreSeparated() throws Exception {
        useGroups(25);
        addValidRow("Астана — Караганда");
        poller.poll();
        sleeper.clear();

        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(25);
        var typing = sleeper.sleeps().stream().filter(d -> d.compareTo(Duration.ofSeconds(6)) <= 0).toList();
        var groupPauses = sleeper.sleeps().stream().filter(d -> d.compareTo(Duration.ofSeconds(6)) > 0 && d.compareTo(Duration.ofMinutes(5)) < 0).toList();
        var wavePauses = sleeper.sleeps().stream().filter(d -> d.compareTo(Duration.ofMinutes(5)) >= 0).toList();
        assertThat(typing).hasSize(25).allMatch(d -> d.compareTo(Duration.ofSeconds(2)) >= 0);
        assertThat(wavePauses).hasSize(2).allMatch(d -> d.compareTo(Duration.ofMinutes(10)) >= 0 && d.compareTo(Duration.ofMinutes(20)) <= 0);
        assertThat(groupPauses).hasSizeGreaterThanOrEqualTo(20).allMatch(d -> d.compareTo(Duration.ofSeconds(60)) <= 0);
        assertThat(new HashSet<>(groupPauses)).hasSizeGreaterThan(groupPauses.size() / 2);
    }

    @Test
    void progressIsWrittenToSheetInBatchesNotPerGroup() throws Exception {
        useGroups(25);
        addValidRow("Павлодар — Актобе");
        poller.poll();
        var before = sheet.writeCalls();

        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(25);
        assertThat(sheet.writeCalls() - before).isLessThan(10);
    }

    @Test
    void newRequestWaitsInFifoQueueWhileAnotherIsSending() throws Exception {
        useGroups(5);
        var first = addValidRow("Первая");
        poller.poll();
        dispatcher.cycle();
        dispatcher.cycle();
        var second = addValidRow("Вторая");
        poller.poll();
        buffer.flush();
        assertThat(sheet.row(second).get(SheetField.STATUS)).isEqualTo("В очереди");

        runUntilBlocked(500);

        var texts = gateway.sent().stream().map(message -> message.text()).toList();
        assertThat(texts).hasSize(10);
        assertThat(texts.subList(0, 5)).allMatch(text -> text.contains("Первая"));
        assertThat(texts.subList(5, 10)).allMatch(text -> text.contains("Вторая"));
        assertThat(sheet.row(first).get(SheetField.STATUS)).isEqualTo("Отправлено");
        assertThat(sheet.row(second).get(SheetField.STATUS)).isEqualTo("Отправлено");
    }

    @Test
    void failedSendIsRecordedAndOtherGroupsStillReceive() throws Exception {
        useGroups(5);
        gateway.failFor("12036399000003@g.us");
        var row = addValidRow("Семей — Усть-Каменогорск");
        poller.poll();

        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(4).doesNotContain("12036399000003@g.us");
        assertThat(sheet.row(row).get(SheetField.PROGRESS)).isEqualTo("4 / 5");
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("Отправлено");
        assertThat(risk.eventsInWindow()).isEqualTo(1);
    }
}
