package kz.wasender.dispatch;

import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import kz.wasender.template.PreviewService;
import kz.wasender.whatsapp.fake.FakeWhatsAppGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class CsvFullCycleTest extends IntegrationTest {
    @Autowired
    PreviewService preview;

    @Override
    protected boolean clearSheet() {
        return false;
    }

    private static String golden(String name) throws Exception {
        return Files.readString(Path.of("src/test/resources/golden", name), StandardCharsets.UTF_8);
    }

    @Test
    void testSheetRequestsReachEveryActiveGroupExactlyOnceAsGoldenTexts() throws Exception {
        groupSync.sync();

        assertThat(poller.poll()).isEqualTo(3);
        runUntilBlocked(2000);

        assertThat(sheet.rows()).extracting(row -> row.get(SheetField.ID)).containsExactly("1", "2", "3");
        assertThat(sheet.rows()).allSatisfy(row -> {
            assertThat(row.get(SheetField.STATUS)).isEqualTo("Отправлено");
            assertThat(row.get(SheetField.PROGRESS)).isEqualTo("25 / 25");
        });
        var byText = gateway.sent().stream().collect(Collectors.groupingBy(FakeWhatsAppGateway.SentMessage::text, Collectors.counting()));
        assertThat(byText).containsOnly(
                Map.entry(golden("kalzhat-baku.txt"), 25L),
                Map.entry(golden("horgos-baku.txt"), 25L),
                Map.entry(golden("horgos-moscow.txt"), 25L));
        assertThat(gateway.sent()).extracting(message -> message.groupJid() + message.text()).doesNotHaveDuplicates();
    }

    @Test
    void previewByRowIdAndByFieldsDoesNotSend() throws Exception {
        poller.poll();

        assertThat(preview.byId("2")).contains(golden("horgos-baku.txt"));
        assertThat(preview.byId("99")).isEmpty();
        var text = preview.byFields(Map.of(
                "Маршрут", "ХОРГОС → МОСКВА",
                "Дата / срочность", "Погрузка 10 сентября",
                "Машины и тоннаж", "130 м³ / 6 осей — ⚖️ 23 т",
                "Груз", "Хозтовары",
                "Фрахт", "🔥🔥",
                "Доп. условия", "🛃 Растаможка — Москва"));
        assertThat(text).isEqualTo(golden("horgos-moscow.txt"));
        assertThat(gateway.sent()).isEmpty();
    }
}
