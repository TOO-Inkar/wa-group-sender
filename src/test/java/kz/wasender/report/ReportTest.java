package kz.wasender.report;

import kz.wasender.support.IntegrationTest;
import kz.wasender.web.AdminController;
import kz.wasender.web.ReportController;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class ReportTest extends IntegrationTest {

    @Autowired
    AdminController admin;
    @Autowired
    ReportController controller;
    @Autowired
    ReportService reports;
    @Autowired
    PdfReportWriter pdf;

    @Test
    void reportCountsSendsAndExplainsFailuresInPlainWords() throws Exception {
        useGroups(3);
        gateway.failFor("12036399000003@g.us");
        admin.createRequest(new AdminController.NewRequest("1️⃣ ХОРГОС → БАКУ", "Срочно", "Тент 20 т", "Мука", "🔥", null, null));
        runUntilBlocked(500);

        var report = reports.request("1").orElseThrow();

        assertThat(report.summary().sent()).isEqualTo(2);
        assertThat(report.summary().failed()).isEqualTo(1);
        assertThat(report.deliveries()).extracting(Report.DeliveryRow::group).contains("Группа 1", "Группа 3");
        assertThat(report.deliveries()).filteredOn(Report.DeliveryRow::problem).singleElement()
                .satisfies(row -> assertThat(row.reason()).isEqualTo("ошибка отправки"));
        assertThat(report.deliveries()).allSatisfy(row -> assertThat(row.group()).doesNotContain("@g.us"));
    }

    @Test
    void excelHasTheFourSheets() throws Exception {
        useGroups(2);
        admin.createRequest(new AdminController.NewRequest("ХОРГОС → БАКУ", "Срочно", "Тент 20 т", "Мука", "🔥", null, null));
        runUntilBlocked(500);

        var response = controller.period(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 31), "xlsx");

        assertThat(response.getHeaders().getContentDisposition().getFilename()).endsWith(".xlsx");
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream((byte[]) response.getBody()))) {
            assertThat(workbook.getSheetAt(0).getSheetName()).isEqualTo("Сводка");
            assertThat(workbook.getSheet("Заявки").getRow(1).getCell(9).getStringCellValue()).contains("ХОРГОС → БАКУ");
            assertThat(workbook.getSheet("Отправки").getPhysicalNumberOfRows()).isEqualTo(3);
            assertThat(workbook.getSheet("Группы").getPhysicalNumberOfRows()).isEqualTo(3);
        }
    }

    @Test
    void pdfIsBuiltForARequestAndAnEmptyPeriod() throws Exception {
        useGroups(1);
        admin.createRequest(new AdminController.NewRequest("ХОРГОС → БАКУ", "Срочно", "Тент 20 т", "Мука", "🔥", null, null));
        runUntilBlocked(500);

        var single = (byte[]) controller.request("1", "pdf").getBody();
        var empty = (byte[]) controller.period(LocalDate.of(2020, 1, 1), LocalDate.of(2020, 1, 2), "pdf").getBody();

        assertThat(new String(single, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
        assertThat(new String(empty, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
        assertThat(pdf.clean("1️⃣ 📍*ХОРГОС → БАКУ*")).doesNotContain("📍").contains("ХОРГОС");
    }

    @Test
    void invalidPeriodIsRejected() {
        assertThat(controller.period(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), "xlsx").getStatusCode().value()).isEqualTo(400);
        assertThat(controller.period(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 5), "doc").getStatusCode().value()).isEqualTo(400);
        assertThat(controller.request("404", "pdf").getStatusCode().value()).isEqualTo(404);
    }
}
