package kz.wasender.sheets.fake;

import kz.wasender.config.FakeProperties;
import kz.wasender.config.SheetsProperties;
import kz.wasender.sheets.CellWrite;
import kz.wasender.sheets.ColumnLayout;
import kz.wasender.sheets.CsvParser;
import kz.wasender.sheets.RequestSource;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
@Profile("fake")
public class FakeRequestSource implements RequestSource {

    private static final Logger log = LoggerFactory.getLogger(FakeRequestSource.class);

    private final SheetsProperties properties;
    private final List<List<String>> grid = new ArrayList<>();
    private int writeCalls;

    public FakeRequestSource(FakeProperties fake, SheetsProperties properties) {
        this.properties = properties;
        for (var row : CsvParser.parse(load(fake.sheetCsv()))) {
            grid.add(new ArrayList<>(row));
        }
        log.info("FAKE SHEET loaded {} rows from {}", grid.size() - properties.headerRow(), fake.sheetCsv().isBlank() ? "classpath:fake/test-sheet.csv" : fake.sheetCsv());
    }

    public synchronized int addRow(Map<SheetField, String> values) {
        var layout = layout();
        var width = grid.get(properties.headerRow() - 1).size();
        var row = new ArrayList<String>();
        for (var i = 0; i < width; i++) {
            row.add("");
        }
        values.forEach((field, value) -> row.set(layout.index(field), value));
        grid.add(row);
        return grid.size();
    }

    public synchronized SheetRow row(int rowNumber) {
        return layout().rows(grid.subList(0, rowNumber), rowNumber - 1).getFirst();
    }

    public synchronized List<SheetRow> rows() {
        return readRows();
    }

    public synchronized int writeCalls() {
        return writeCalls;
    }

    public synchronized void clearData() {
        while (grid.size() > properties.headerRow()) {
            grid.removeLast();
        }
        writeCalls = 0;
    }

    public synchronized void replaceHeader(List<String> header) {
        grid.set(properties.headerRow() - 1, new ArrayList<>(header));
    }

    @Override
    public synchronized List<SheetRow> readRows() {
        return layout().requireComplete().rows(grid, properties.headerRow());
    }

    @Override
    public synchronized void write(List<CellWrite> writes) {
        if (writes.isEmpty()) {
            return;
        }
        var layout = layout().requireComplete();
        writeCalls++;
        for (var write : writes) {
            var row = grid.get(write.rowNumber() - 1);
            var index = layout.index(write.field());
            while (row.size() <= index) {
                row.add("");
            }
            row.set(index, write.value());
            log.info("FAKE SHEET row={} {}={}", write.rowNumber(), write.field(), write.value());
        }
    }

    @Override
    public synchronized List<String> missingHeaders() {
        return layout().missing();
    }

    private ColumnLayout layout() {
        return new ColumnLayout(properties.columns(), grid.isEmpty() ? List.of() : grid.get(properties.headerRow() - 1));
    }

    private static String load(String path) {
        try {
            if (path == null || path.isBlank()) {
                return new ClassPathResource("fake/test-sheet.csv").getContentAsString(StandardCharsets.UTF_8);
            }
            return Files.readString(Path.of(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read fake sheet " + path, e);
        }
    }
}
