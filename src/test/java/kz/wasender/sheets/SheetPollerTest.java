package kz.wasender.sheets;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SheetPollerTest extends IntegrationTest {

    @Test
    void rowWithMissingFieldsGetsReadableErrorAndIsNotQueued() {
        var row = sheet.addRow("", "Алматы — Астана", "", "Мука", "02.10.2026", "");

        assertThat(poller.poll()).isZero();

        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("Ошибка: не заполнено Тоннаж, Фрахт");
        assertThat(sheet.row(row).get(SheetField.ID)).isEmpty();
        assertThat(requests.findAll()).isEmpty();
        assertThat(poller.poll()).isZero();
    }

    @Test
    void emptyIdIsGeneratedAndWrittenBeforeQueueing() {
        var row = addValidRow("Костанай — Кокшетау");

        assertThat(poller.poll()).isEqualTo(1);

        var id = sheet.row(row).get(SheetField.ID);
        assertThat(id).isNotBlank();
        assertThat(requests.find(id)).isPresent();
        assertThat(requests.find(id).orElseThrow().sheetRow()).isEqualTo(row);
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("В очереди");
    }

    @Test
    void existingIdIsKeptAndRequestIsQueuedOnlyOnce() {
        var row = sheet.addRow("MANUAL-1", "Атырау — Актау", "10 т", "Трубы", "03.10.2026", "300 000 ₸");

        assertThat(poller.poll()).isEqualTo(1);
        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(requests.find("MANUAL-1")).isPresent();
        assertThat(sheet.row(row).get(SheetField.ID)).isEqualTo("MANUAL-1");
    }

    @Test
    void clearedStatusOfKnownRequestIsRestoredWithoutResending() {
        var row = sheet.addRow("MANUAL-2", "Уральск — Актобе", "5 т", "Зерно", "04.10.2026", "200 000 ₸");
        poller.poll();
        sheet.write(java.util.List.of(new CellWrite(row, SheetField.STATUS, "")));

        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sheet.row(row).get(SheetField.STATUS)).isEqualTo("В очереди");
    }

    @Test
    void copiedRowWithSameIdIsRejectedAsDuplicate() {
        sheet.addRow("MANUAL-3", "Тараз — Шымкент", "7 т", "Сахар", "05.10.2026", "150 000 ₸");
        poller.poll();
        var copy = sheet.addRow("MANUAL-3", "Тараз — Шымкент", "7 т", "Сахар", "05.10.2026", "150 000 ₸");

        assertThat(poller.poll()).isZero();

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sheet.row(copy).get(SheetField.STATUS)).isEqualTo("Ошибка: дубликат ID MANUAL-3");
    }

    @Test
    void rowsWithStatusAreIgnored() {
        var row = addValidRow("Старая заявка");
        sheet.write(java.util.List.of(new CellWrite(row, SheetField.STATUS, "Отправлено")));

        assertThat(poller.poll()).isZero();
        assertThat(requests.findAll()).isEmpty();
    }
}
