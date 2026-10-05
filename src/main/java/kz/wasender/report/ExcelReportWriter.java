package kz.wasender.report;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * The report as an Excel workbook: a summary sheet, then requests, sends and groups as filterable tables.
 * Column widths are fixed rather than auto-sized: auto-sizing needs desktop fonts the container does not have.
 */
@Component
public class ExcelReportWriter {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");

    public byte[] write(Report report) {
        try (var workbook = new XSSFWorkbook(); var out = new ByteArrayOutputStream()) {
            var styles = new Styles(workbook);
            summary(workbook.createSheet("Сводка"), report, styles);
            requests(workbook.createSheet("Заявки"), report, styles);
            deliveries(workbook.createSheet("Отправки"), report, styles);
            groups(workbook.createSheet("Группы"), report, styles);
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot build the Excel report", e);
        }
    }

    private void summary(Sheet sheet, Report report, Styles styles) {
        var s = report.summary();
        var row = sheet.createRow(0);
        text(row, 0, report.title(), styles.title);
        text(sheet.createRow(1), 0, report.scope(), styles.muted);
        text(sheet.createRow(2), 0, "Сформирован " + report.generatedAt().format(STAMP), styles.muted);
        var lines = new Object[][] {
                {"Заявок", s.requests()},
                {"Отправок в группы", s.deliveries()},
                {"Отправлено", s.sent()},
                {"С ошибкой", s.failed()},
                {"Пропущено", s.skipped()},
                {"Ещё в очереди", s.pending()},
                {"Доля успешных отправок", s.successRate() == null ? null : s.successRate() / 100},
                {"Групп получили сообщение", s.groupsReached()},
        };
        var r = 4;
        for (var line : lines) {
            var current = sheet.createRow(r++);
            text(current, 0, (String) line[0], styles.label);
            var cell = current.createCell(1);
            if (line[1] instanceof Integer number) {
                cell.setCellValue(number);
                cell.setCellStyle(styles.number);
            } else if (line[1] instanceof Double share) {
                cell.setCellValue(share);
                cell.setCellStyle(styles.percent);
            } else {
                cell.setCellValue("—");
                cell.setCellStyle(styles.number);
            }
        }
        if (report.single()) {
            r++;
            text(sheet.createRow(r++), 0, "Текст сообщения", styles.label);
            var message = sheet.createRow(r);
            text(message, 0, report.message(), styles.wrap);
            message.setHeightInPoints(Math.min(409, 15f * (report.message().split("\n", -1).length + 1)));
            sheet.addMergedRegion(new CellRangeAddress(r, r, 0, 3));
        }
        sheet.setColumnWidth(0, 34 * 256);
        sheet.setColumnWidth(1, 16 * 256);
        sheet.setColumnWidth(2, 30 * 256);
        sheet.setColumnWidth(3, 30 * 256);
    }

    private void requests(Sheet sheet, Report report, Styles styles) {
        header(sheet, styles, List.of("№", "Создана", "Завершена", "Статус", "Куда", "Отправлено", "Ошибок", "Пропущено", "Всего", "Заявка"),
                List.of(7, 17, 17, 14, 24, 12, 10, 11, 9, 50));
        var r = 1;
        for (var request : report.requests()) {
            var row = sheet.createRow(r++);
            text(row, 0, request.id(), styles.plain);
            date(row, 1, request.created(), styles);
            date(row, 2, request.completed(), styles);
            text(row, 3, request.status(), styles.plain);
            text(row, 4, request.target(), styles.plain);
            number(row, 5, request.sent(), styles);
            number(row, 6, request.failed(), styles);
            number(row, 7, request.skipped(), styles);
            number(row, 8, request.total(), styles);
            text(row, 9, request.title(), styles.plain);
        }
        finish(sheet, r, 10);
    }

    private void deliveries(Sheet sheet, Report report, Styles styles) {
        header(sheet, styles, List.of("Заявка №", "Группа", "Время", "Статус", "Причина"), List.of(10, 44, 17, 14, 48));
        var r = 1;
        for (var delivery : report.deliveries()) {
            var row = sheet.createRow(r++);
            text(row, 0, delivery.requestId(), styles.plain);
            text(row, 1, delivery.group(), styles.plain);
            date(row, 2, delivery.time(), styles);
            text(row, 3, delivery.status(), delivery.problem() ? styles.problem : styles.plain);
            text(row, 4, delivery.reason() == null ? "" : delivery.reason(), styles.plain);
        }
        finish(sheet, r, 5);
    }

    private void groups(Sheet sheet, Report report, Styles styles) {
        header(sheet, styles, List.of("Группа", "Получила заявок", "Ошибок"), List.of(48, 17, 10));
        var r = 1;
        for (var group : report.groups()) {
            var row = sheet.createRow(r++);
            text(row, 0, group.group(), styles.plain);
            number(row, 1, group.received(), styles);
            number(row, 2, group.failed(), styles);
        }
        finish(sheet, r, 3);
    }

    private static void header(Sheet sheet, Styles styles, List<String> titles, List<Integer> widths) {
        var row = sheet.createRow(0);
        for (var i = 0; i < titles.size(); i++) {
            text(row, i, titles.get(i), styles.header);
            sheet.setColumnWidth(i, widths.get(i) * 256);
        }
        row.setHeightInPoints(20);
    }

    private static void finish(Sheet sheet, int rows, int columns) {
        sheet.createFreezePane(0, 1);
        if (rows > 1) {
            sheet.setAutoFilter(new CellRangeAddress(0, rows - 1, 0, columns - 1));
        }
    }

    private static void text(Row row, int column, String value, CellStyle style) {
        var cell = row.createCell(column);
        cell.setCellValue(value == null ? "" : value);
        cell.setCellStyle(style);
    }

    private static void number(Row row, int column, int value, Styles styles) {
        var cell = row.createCell(column);
        cell.setCellValue(value);
        cell.setCellStyle(styles.number);
    }

    private static void date(Row row, int column, LocalDateTime value, Styles styles) {
        var cell = row.createCell(column);
        if (value == null) {
            cell.setCellValue("");
            cell.setCellStyle(styles.plain);
            return;
        }
        cell.setCellValue(value);
        cell.setCellStyle(styles.date);
    }

    private static final class Styles {

        final CellStyle title;
        final CellStyle muted;
        final CellStyle label;
        final CellStyle header;
        final CellStyle plain;
        final CellStyle wrap;
        final CellStyle number;
        final CellStyle percent;
        final CellStyle date;
        final CellStyle problem;

        Styles(Workbook workbook) {
            var titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 14);
            title = workbook.createCellStyle();
            title.setFont(titleFont);

            var mutedFont = workbook.createFont();
            mutedFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            muted = workbook.createCellStyle();
            muted.setFont(mutedFont);

            var boldFont = workbook.createFont();
            boldFont.setBold(true);
            label = workbook.createCellStyle();
            label.setFont(boldFont);

            header = workbook.createCellStyle();
            header.setFont(boldFont);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            header.setVerticalAlignment(VerticalAlignment.CENTER);
            header.setBorderBottom(BorderStyle.THIN);

            plain = workbook.createCellStyle();
            plain.setVerticalAlignment(VerticalAlignment.TOP);

            wrap = workbook.createCellStyle();
            wrap.setWrapText(true);
            wrap.setVerticalAlignment(VerticalAlignment.TOP);

            number = workbook.createCellStyle();
            number.setAlignment(HorizontalAlignment.RIGHT);
            number.setVerticalAlignment(VerticalAlignment.TOP);

            var format = workbook.getCreationHelper().createDataFormat();
            percent = workbook.createCellStyle();
            percent.setDataFormat(format.getFormat("0.0%"));
            percent.setAlignment(HorizontalAlignment.RIGHT);

            date = workbook.createCellStyle();
            date.setDataFormat(format.getFormat("dd.mm.yyyy hh:mm"));
            date.setVerticalAlignment(VerticalAlignment.TOP);

            var redFont = workbook.createFont();
            redFont.setColor(IndexedColors.DARK_RED.getIndex());
            problem = workbook.createCellStyle();
            problem.setFont(redFont);
            problem.setVerticalAlignment(VerticalAlignment.TOP);
        }
    }
}
