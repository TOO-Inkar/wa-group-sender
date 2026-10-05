package kz.wasender.report;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * The report as a PDF to send to the customer: summary figures, the requests, and either every send of one request or
 * the problem sends and per-group totals of a period. PT Sans (OFL, bundled in resources/fonts) carries the Cyrillic;
 * characters it has no glyph for, such as emoji, are left out instead of printing as empty boxes.
 */
@Component
public class PdfReportWriter {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final Color INK = new Color(0x14, 0x20, 0x27);
    private static final Color MUTED = new Color(0x5d, 0x6b, 0x74);
    private static final Color LINE = new Color(0xdd, 0xe3, 0xe7);
    private static final Color HEAD = new Color(0xee, 0xf2, 0xf4);
    private static final Color ACCENT = new Color(0x0f, 0x7b, 0x5f);
    private static final Color BAD = new Color(0xb2, 0x34, 0x2b);

    private final BaseFont regular;
    private final BaseFont bold;

    public PdfReportWriter() {
        this.regular = font("fonts/PTSans-Regular.ttf");
        this.bold = font("fonts/PTSans-Bold.ttf");
    }

    public byte[] write(Report report) {
        var out = new ByteArrayOutputStream();
        var document = new Document(PageSize.A4, 40, 40, 44, 44);
        try {
            PdfWriter.getInstance(document, out);
            document.addTitle(clean(report.title()));
            document.open();
            header(document, report);
            summary(document, report);
            if (report.single()) {
                message(document, report);
            }
            requests(document, report);
            if (report.single()) {
                deliveries(document, "Отправка по группам", report.deliveries());
            } else {
                var problems = report.deliveries().stream().filter(Report.DeliveryRow::problem).toList();
                if (!problems.isEmpty()) {
                    deliveries(document, "Отправки с ошибкой", problems);
                }
                groups(document, report);
            }
        } catch (DocumentException e) {
            throw new IllegalStateException("Cannot build the PDF report", e);
        } finally {
            if (document.isOpen()) {
                document.close();
            }
        }
        return out.toByteArray();
    }

    private void header(Document document, Report report) throws DocumentException {
        var title = new Paragraph(clean(report.title()), new Font(bold, 18, Font.NORMAL, INK));
        title.setSpacingAfter(2);
        document.add(title);
        var scope = new Paragraph(clean(report.scope()) + " · сформирован " + report.generatedAt().format(STAMP),
                new Font(regular, 10, Font.NORMAL, MUTED));
        scope.setSpacingAfter(16);
        document.add(scope);
    }

    private void summary(Document document, Report report) throws DocumentException {
        var s = report.summary();
        var rate = s.successRate() == null ? "—" : String.format(Locale.ROOT, "%.0f%%", s.successRate());
        var table = new PdfPTable(4);
        table.setWidthPercentage(100);
        table.setSpacingAfter(18);
        figure(table, Integer.toString(s.requests()), "заявок", INK);
        figure(table, Integer.toString(s.sent()), "отправлено в группы", ACCENT);
        figure(table, Integer.toString(s.failed()), "с ошибкой", s.failed() > 0 ? BAD : INK);
        figure(table, rate, "успешных отправок", INK);
        document.add(table);
        if (s.skipped() > 0 || s.pending() > 0) {
            var note = new Paragraph("Пропущено: " + s.skipped() + " · ещё в очереди: " + s.pending()
                    + " · групп получили сообщение: " + s.groupsReached(), new Font(regular, 9, Font.NORMAL, MUTED));
            note.setSpacingBefore(-10);
            note.setSpacingAfter(16);
            document.add(note);
        }
    }

    private void figure(PdfPTable table, String value, String label, Color color) {
        var phrase = new Phrase();
        phrase.add(new Phrase(value + "\n", new Font(bold, 20, Font.NORMAL, color)));
        phrase.add(new Phrase(label, new Font(regular, 9, Font.NORMAL, MUTED)));
        var cell = new PdfPCell(phrase);
        cell.setBorder(Rectangle.BOX);
        cell.setBorderColor(LINE);
        cell.setPadding(10);
        cell.setPaddingTop(6);
        table.addCell(cell);
    }

    private void message(Document document, Report report) throws DocumentException {
        section(document, "Текст сообщения");
        var table = new PdfPTable(1);
        table.setWidthPercentage(100);
        table.setSpacingAfter(18);
        var cell = new PdfPCell(new Phrase(clean(report.message().replace("*", "")), new Font(regular, 10, Font.NORMAL, INK)));
        cell.setBackgroundColor(HEAD);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setPadding(12);
        table.addCell(cell);
        document.add(table);
    }

    private void requests(Document document, Report report) throws DocumentException {
        section(document, report.single() ? "Заявка" : "Заявки");
        if (report.requests().isEmpty()) {
            document.add(new Paragraph("За этот период заявок не было.", new Font(regular, 10, Font.NORMAL, MUTED)));
            return;
        }
        var table = table(new float[] {6, 15, 15, 12, 18, 12, 22});
        head(table, List.of("№", "Создана", "Завершена", "Статус", "Куда", "Отправлено", "Заявка"));
        for (var request : report.requests()) {
            cell(table, request.id(), INK);
            cell(table, stamp(request.created()), INK);
            cell(table, stamp(request.completed()), INK);
            cell(table, request.status(), INK);
            cell(table, request.target(), INK);
            cell(table, request.sent() + " из " + request.total() + (request.failed() > 0 ? ", ошибок " + request.failed() : ""),
                    request.failed() > 0 ? BAD : INK);
            cell(table, request.title(), INK);
        }
        document.add(table);
    }

    private void deliveries(Document document, String title, List<Report.DeliveryRow> rows) throws DocumentException {
        section(document, title);
        var table = table(new float[] {8, 34, 15, 13, 30});
        head(table, List.of("Заявка", "Группа", "Время", "Статус", "Причина"));
        for (var row : rows) {
            cell(table, "№" + row.requestId(), INK);
            cell(table, row.group(), INK);
            cell(table, stamp(row.time()), INK);
            cell(table, row.status(), row.problem() ? BAD : INK);
            cell(table, row.reason() == null ? "" : row.reason(), MUTED);
        }
        document.add(table);
    }

    private void groups(Document document, Report report) throws DocumentException {
        if (report.groups().isEmpty()) {
            return;
        }
        section(document, "Группы");
        var table = table(new float[] {60, 20, 20});
        head(table, List.of("Группа", "Получила заявок", "Ошибок"));
        for (var group : report.groups()) {
            cell(table, group.group(), INK);
            cell(table, Integer.toString(group.received()), INK);
            cell(table, Integer.toString(group.failed()), group.failed() > 0 ? BAD : INK);
        }
        document.add(table);
    }

    private void section(Document document, String title) throws DocumentException {
        var paragraph = new Paragraph(title, new Font(bold, 12, Font.NORMAL, INK));
        paragraph.setSpacingBefore(6);
        paragraph.setSpacingAfter(6);
        document.add(paragraph);
    }

    private PdfPTable table(float[] widths) {
        var table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setHeaderRows(1);
        table.setSpacingAfter(16);
        return table;
    }

    private void head(PdfPTable table, List<String> titles) {
        for (var title : titles) {
            var cell = new PdfPCell(new Phrase(title, new Font(bold, 8.5f, Font.NORMAL, MUTED)));
            cell.setBackgroundColor(HEAD);
            cell.setBorder(Rectangle.BOTTOM);
            cell.setBorderColor(LINE);
            cell.setPadding(5);
            table.addCell(cell);
        }
    }

    private void cell(PdfPTable table, String text, Color color) {
        var cell = new PdfPCell(new Phrase(clean(text), new Font(regular, 9, Font.NORMAL, color)));
        cell.setBorder(Rectangle.BOTTOM);
        cell.setBorderColor(LINE);
        cell.setPadding(5);
        cell.setVerticalAlignment(Element.ALIGN_TOP);
        table.addCell(cell);
    }

    private static String stamp(LocalDateTime time) {
        return time == null ? "—" : time.format(STAMP);
    }

    /** Drops characters the font cannot draw (emoji, keycap marks) and the spaces they leave behind. */
    String clean(String text) {
        if (text == null) {
            return "";
        }
        var builder = new StringBuilder(text.length());
        text.codePoints().forEach(cp -> {
            if (cp == '\n' || cp == ' ' || regular.charExists(cp)) {
                builder.appendCodePoint(cp);
            }
        });
        return builder.toString().replaceAll("[ \\t]+", " ").replaceAll("(?m)^ | $", "").strip();
    }

    private static BaseFont font(String path) {
        try {
            var bytes = new ClassPathResource(path).getContentAsByteArray();
            return BaseFont.createFont(path.substring(path.lastIndexOf('/') + 1), BaseFont.IDENTITY_H, BaseFont.EMBEDDED, true, bytes, null);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read font " + path, e);
        } catch (DocumentException e) {
            throw new IllegalStateException("Cannot load font " + path, e);
        }
    }
}
