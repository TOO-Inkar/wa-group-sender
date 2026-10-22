package kz.wasender.sheets;

import kz.wasender.config.SheetsProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ColumnLayoutTest {
    private static final SheetsProperties.Columns COLUMNS = new SheetsProperties.Columns("ID", "Маршрут", "Дата / срочность",
            "Машины и тоннаж", "Груз", "Фрахт", "Доп. условия", "Статус", "Отправлено / всего", "Завершено");

    @Test
    void findsColumnsByHeaderInAnyOrder() {
        var header = List.of("Статус", "  маршрут ", "ID", "Груз", "Фрахт", "Дата /  срочность", "Машины и тоннаж",
                "Доп. условия", "Отправлено / всего", "Завершено", "Комментарий");

        var layout = new ColumnLayout(COLUMNS, header).requireComplete();

        assertThat(layout.index(SheetField.ROUTE)).isEqualTo(1);
        assertThat(layout.letter(SheetField.ID)).isEqualTo("C");
        assertThat(layout.letter(SheetField.COMPLETED)).isEqualTo("J");
    }

    @Test
    void reportsMissingHeaders() {
        var layout = new ColumnLayout(COLUMNS, List.of("ID", "Маршрут", "Груз"));

        assertThat(layout.missing()).containsExactly("Дата / срочность", "Машины и тоннаж", "Фрахт", "Доп. условия",
                "Статус", "Отправлено / всего", "Завершено");
        assertThatThrownBy(layout::requireComplete).isInstanceOf(SheetLayoutException.class).hasMessageContaining("Фрахт");
    }

    @Test
    void convertsIndexesToLetters() {
        assertThat(ColumnLayout.toLetter(0)).isEqualTo("A");
        assertThat(ColumnLayout.toLetter(25)).isEqualTo("Z");
        assertThat(ColumnLayout.toLetter(26)).isEqualTo("AA");
        assertThat(ColumnLayout.toLetter(54)).isEqualTo("BC");
    }

    @Test
    void parsesCsvWithQuotedMultilineCells() {
        var rows = CsvParser.parse((char) 0xFEFF + "a,b,c\r\n1,\"x\r\ny\",\"q\"\"q\"\n,,\n");

        assertThat(rows).containsExactly(List.of("a", "b", "c"), List.of("1", "x\ny", "q\"q"), List.of("", "", ""));
    }

    @Test
    void csvWriteIsReadBackUnchanged() {
        var rows = List.of(List.of("ID", "Доп. условия"), List.of("17", "🚗 Выход через Калжат\n⛴️ По суше, \"быстро\""));

        assertThat(CsvParser.parse(CsvParser.write(rows))).isEqualTo(rows);
    }
}
