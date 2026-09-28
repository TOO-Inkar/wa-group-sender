package kz.wasender.template;

import kz.wasender.config.TemplateProperties;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TemplateRendererTest {

    @TempDir
    Path dir;

    private final SheetRow row = new SheetRow(2, Map.of(
            SheetField.ID, "R1",
            SheetField.ROUTE, "Алматы — Астана",
            SheetField.TONNAGE, "20 т",
            SheetField.CARGO, "Цемент",
            SheetField.DATE, "01.10.2026",
            SheetField.FREIGHT, "500 000 ₸"));

    @Test
    void substitutesEnglishAndRussianPlaceholders() throws Exception {
        var file = dir.resolve("message.txt");
        Files.writeString(file, "#{{id}} {{ route }}\n{{Тоннаж}} / {{cargo}} / {{date}} / {{фрахт}} {{unknown}} $1");

        var text = new TemplateRenderer(new TemplateProperties(file)).render(row);

        assertThat(text).isEqualTo("#R1 Алматы — Астана\n20 т / Цемент / 01.10.2026 / 500 000 ₸ {{unknown}} $1");
    }

    @Test
    void templateIsReReadWithoutRestart() throws Exception {
        var file = dir.resolve("message.txt");
        var renderer = new TemplateRenderer(new TemplateProperties(file));
        Files.writeString(file, "v1 {{route}}");
        assertThat(renderer.render(row)).isEqualTo("v1 Алматы — Астана");

        Files.writeString(file, "v2 {{cargo}}");

        assertThat(renderer.render(row)).isEqualTo("v2 Цемент");
    }

    @Test
    void fallsBackToBundledTemplate() {
        var text = new TemplateRenderer(new TemplateProperties(dir.resolve("absent.txt"))).render(row);

        assertThat(text).contains("R1", "Алматы — Астана", "20 т", "Цемент", "01.10.2026", "500 000 ₸").doesNotContain("{{");
    }
}
