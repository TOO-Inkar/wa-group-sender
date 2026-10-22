package kz.wasender.sheets;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SheetPollerTest extends IntegrationTest {
    @Test
    void rowWithMissingFieldsGetsReadableErrorAndIsNotQueued() {
        var row = sheet.addRow(Map.of(SheetField.ROUTE, "АЛМАТЫ → АСТАНА", SheetField.DATE, "Срочно", SheetField.CARGO, "Мука"));

        assertThat(poller.poll()).isZero();

        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("Ошибка: не заполнено Машины и тоннаж, Фрахт");
        assertThat(sheet.row(row).get(SheetField.ID)).isEmpty();
        assertThat(requests.findAll()).isEmpty();
        assertThat(poller.poll()).isZero();
    }

    @Test
    void optionalConditionsMayBeEmpty() {
        addValidRow("ХОРГОС → МОСКВА");

        assertThat(poller.poll()).isEqualTo(1);
    }

    @Test
    void emptyIdIsGeneratedAsNextNumberAndWrittenBeforeQueueing() {
        sheet.addRow(Map.of(SheetField.ID, "16", SheetField.ROUTE, "А", SheetField.DATE, "Д", SheetField.VEHICLES, "М",
                SheetField.CARGO, "Г", SheetField.FREIGHT, "Ф", SheetField.STATUS, "Отправлено"));
        var first = addValidRow("ХОРГОС → БАКУ");
        var second = addValidRow("КАЛЖАТ → БАКУ");

        assertThat(poller.poll()).isEqualTo(2);

        assertThat(sheet.row(first).get(SheetField.ID)).isEqualTo("17");
        assertThat(sheet.row(second).get(SheetField.ID)).isEqualTo("18");
        assertThat(requests.find("17").orElseThrow().sheetRow()).isEqualTo(first);
        assertThat(sheet.row(first).get(SheetField.STATUS)).isEqualTo("В очереди");
    }

    @Test
    void existingIdIsKeptAndRequestIsQueuedOnlyOnce() {
        var row = sheet.addRow(Map.of(SheetField.ID, "MANUAL-1", SheetField.ROUTE, "АТЫРАУ → АКТАУ", SheetField.DATE, "Завтра",
                SheetField.VEHICLES, "Тент 20 т", SheetField.CARGO, "Трубы", SheetField.FREIGHT, "300 000 ₸"));

        assertThat(poller.poll()).isEqualTo(1);
        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sheet.row(row).get(SheetField.ID)).isEqualTo("MANUAL-1");
    }

    @Test
    void clearedStatusOfKnownRequestIsRestoredWithoutResending() {
        var row = addValidRow("УРАЛЬСК → АКТОБЕ");
        poller.poll();
        sheet.write(List.of(new CellWrite(row, SheetField.STATUS, "")));

        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("В очереди");
    }

    @Test
    void copiedRowWithSameIdIsRejectedAsDuplicate() {
        var original = addValidRow("ТАРАЗ → ШЫМКЕНТ");
        poller.poll();
        var id = sheet.row(original).get(SheetField.ID);
        var copy = sheet.addRow(Map.of(SheetField.ID, id, SheetField.ROUTE, "ТАРАЗ → ШЫМКЕНТ", SheetField.DATE, "Срочно",
                SheetField.VEHICLES, "Тент", SheetField.CARGO, "Сахар", SheetField.FREIGHT, "🔥"));

        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sheet.row(copy).get(SheetField.STATUS)).isEqualTo("Ошибка: дубликат ID " + id);
    }

    @Test
    void missingHeadersAreReportedWithoutCrashing() {
        addValidRow("ХОРГОС → БАКУ");
        sheet.replaceHeader(List.of("ID", "Маршрут", "Дата", "Машины и тоннаж", "Груз", "Фрахт", "Доп. условия", "Статус",
                "Отправлено / всего", "Завершено"));

        assertThat(poller.checkLayout()).isFalse();
        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).isEmpty();
        assertThat(notifier.anyContains("нет колонок: Дата / срочность")).isTrue();
    }
}
