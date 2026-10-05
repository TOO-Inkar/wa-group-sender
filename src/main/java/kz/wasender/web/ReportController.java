package kz.wasender.web;

import kz.wasender.report.ExcelReportWriter;
import kz.wasender.report.PdfReportWriter;
import kz.wasender.report.Report;
import kz.wasender.report.ReportService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/** Report downloads for the customer: Excel or PDF, for one request or for a period. */
@RestController
@RequestMapping("/api/admin/reports")
public class ReportController {

    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private static final long MAX_DAYS = 366;

    private final ReportService reports;
    private final ExcelReportWriter excel;
    private final PdfReportWriter pdf;

    public ReportController(ReportService reports, ExcelReportWriter excel, PdfReportWriter pdf) {
        this.reports = reports;
        this.excel = excel;
        this.pdf = pdf;
    }

    @GetMapping("/period")
    public ResponseEntity<?> period(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                    @RequestParam(defaultValue = "xlsx") String format) {
        if (to.isBefore(from)) {
            return ResponseEntity.badRequest().body(Map.of("message", "дата «по» раньше даты «с»"));
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            return ResponseEntity.badRequest().body(Map.of("message", "период не длиннее года"));
        }
        return file(reports.period(from, to), "wa-report-" + from + "_" + to, format);
    }

    @GetMapping("/requests/{id}")
    public ResponseEntity<?> request(@PathVariable String id, @RequestParam(defaultValue = "xlsx") String format) {
        return reports.request(id)
                .<ResponseEntity<?>>map(report -> file(report, "wa-report-request-" + id.replaceAll("[^0-9A-Za-z-]", ""), format))
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("message", "заявка " + id + " не найдена")));
    }

    private ResponseEntity<?> file(Report report, String name, String format) {
        var isPdf = "pdf".equalsIgnoreCase(format);
        if (!isPdf && !"xlsx".equalsIgnoreCase(format)) {
            return ResponseEntity.badRequest().body(Map.of("message", "format: xlsx или pdf"));
        }
        var body = isPdf ? pdf.write(report) : excel.write(report);
        var disposition = ContentDisposition.attachment().filename(name + (isPdf ? ".pdf" : ".xlsx"), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(isPdf ? MediaType.APPLICATION_PDF : XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(body);
    }
}
