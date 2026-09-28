package kz.wasender.template;

import kz.wasender.config.MessageProperties;
import kz.wasender.config.SheetsProperties;
import kz.wasender.sheets.CsvParser;
import kz.wasender.sheets.ColumnLayout;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TemplateRendererTest {

    static final String CONTACT = "Диспетчер (тест) +7 000 000 00 00";
    static final SheetsProperties.Columns COLUMNS = new SheetsProperties.Columns("ID", "Маршрут", "Дата / срочность",
            "Машины и тоннаж", "Груз", "Фрахт", "Доп. условия", "Статус", "Отправлено / всего", "Завершено");

    @TempDir
    Path dir;

    static TemplateRenderer renderer(Path template, String contact, boolean numbering) {
        var sheets = new SheetsProperties(true, "", "Заявки", null, null, 1, COLUMNS, null, null, 10, "yyyy-MM-dd HH:mm");
        return new TemplateRenderer(new MessageProperties(template, contact, numbering), sheets);
    }

    static List<SheetRow> testSheetRows() throws Exception {
        var values = CsvParser.parse(Files.readString(Path.of("docs/test-sheet.csv"), StandardCharsets.UTF_8));
        return new ColumnLayout(COLUMNS, values.getFirst()).requireComplete().rows(values, 1);
    }

    static SheetRow row(Map<SheetField, String> values) {
        return new SheetRow(2, new EnumMap<>(values));
    }

    @ParameterizedTest
    @CsvSource({"0, kalzhat-baku.txt", "1, horgos-baku.txt", "2, horgos-moscow.txt"})
    void rendersSampleRequestsByteForByte(int index, String golden) throws Exception {
        var expected = Files.readAllBytes(Path.of("src/test/resources/golden", golden));

        var text = renderer(dir.resolve("absent.txt"), CONTACT, false).render(testSheetRows().get(index));

        assertThat(text.getBytes(StandardCharsets.UTF_8)).isEqualTo(expected);
    }

    @Test
    void emptyOptionalFieldRemovesItsLineWithoutDoubleBlankLines() throws Exception {
        var file = dir.resolve("t.txt");
        Files.writeString(file, "📍*{Маршрут}*\n\n{Доп. условия}\n\n📦 {Груз}\n\n\n📞 *{Контакт}*\n");
        var row = row(Map.of(SheetField.ROUTE, "А → Б", SheetField.CARGO, "Мука"));

        var text = renderer(file, "", false).render(row);

        assertThat(text).isEqualTo("📍*А → Б*\n\n📦 Мука");
    }

    @Test
    void multilineCellRepeatsTemplatePrefixOnlyWhereItExists() throws Exception {
        var file = dir.resolve("t.txt");
        Files.writeString(file, "🚛 {Машины и тоннаж}\n{Доп. условия}\n");
        var row = row(Map.of(
                SheetField.VEHICLES, "  120 м³ — 20 т \r\n\r\n\n90 м³ — 15 т\n",
                SheetField.CONDITIONS, "🚗 Первое\n\n⛴️ Второе"));

        var text = renderer(file, "", false).render(row);

        assertThat(text).isEqualTo("🚛 120 м³ — 20 т\n🚛 90 м³ — 15 т\n🚗 Первое\n⛴️ Второе");
    }

    @Test
    void numberingFlagPrefixesKeycapNumber() throws Exception {
        var file = dir.resolve("t.txt");
        Files.writeString(file, "📍*{Маршрут}*\n📞 {Контакт}");
        var row = row(Map.of(SheetField.ID, "17", SheetField.ROUTE, "ХОРГОС → МОСКВА"));

        assertThat(renderer(file, "Тест", true).render(row)).isEqualTo("1️⃣7️⃣ 📍*ХОРГОС → МОСКВА*\n📞 Тест");
        assertThat(renderer(file, "Тест", false).render(row)).isEqualTo("📍*ХОРГОС → МОСКВА*\n📞 Тест");
    }

    @Test
    void templateIsReReadAndUnknownPlaceholdersStay() throws Exception {
        var file = dir.resolve("t.txt");
        var renderer = renderer(file, "", false);
        var row = row(Map.of(SheetField.ROUTE, "А → Б", SheetField.FREIGHT, "$1 🔥"));
        Files.writeString(file, "v1 {Маршрут}");
        assertThat(renderer.render(row)).isEqualTo("v1 А → Б");

        Files.writeString(file, "v2 {Фрахт} {Неизвестно}");

        assertThat(renderer.render(row)).isEqualTo("v2 $1 🔥 {Неизвестно}");
    }

    @Test
    void placeholdersMatchConfiguredHeaderNamesToo() throws Exception {
        var file = dir.resolve("t.txt");
        Files.writeString(file, "{Направление} / {маршрут}");
        var columns = new SheetsProperties.Columns("ID", "Направление", "Дата / срочность", "Машины и тоннаж", "Груз", "Фрахт",
                "Доп. условия", "Статус", "Отправлено / всего", "Завершено");
        var sheets = new SheetsProperties(true, "", "Заявки", null, null, 1, columns, null, null, 10, "yyyy-MM-dd HH:mm");
        var renderer = new TemplateRenderer(new MessageProperties(file, "", false), sheets);

        assertThat(renderer.render(row(Map.of(SheetField.ROUTE, "А → Б")))).isEqualTo("А → Б / А → Б");
    }
}
