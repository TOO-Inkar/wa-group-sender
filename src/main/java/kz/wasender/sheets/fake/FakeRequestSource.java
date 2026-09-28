package kz.wasender.sheets.fake;

import kz.wasender.config.FakeProperties;
import kz.wasender.sheets.CellWrite;
import kz.wasender.sheets.RequestSource;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
@Profile("fake")
public class FakeRequestSource implements RequestSource {

    private static final Logger log = LoggerFactory.getLogger(FakeRequestSource.class);
    private static final int FIRST_ROW = 2;

    private final List<Map<SheetField, String>> rows = new ArrayList<>();
    private int writeCalls;

    public FakeRequestSource(FakeProperties properties) {
        for (var i = 1; i <= properties.seedRequests(); i++) {
            addRow("", "Алматы — Астана " + i, "20 т", "Стройматериалы", "01.10.2026", "450 000 ₸");
        }
    }

    public synchronized int addRow(String id, String route, String tonnage, String cargo, String date, String freight) {
        var row = new EnumMap<SheetField, String>(SheetField.class);
        for (var field : SheetField.values()) {
            row.put(field, "");
        }
        row.put(SheetField.ID, id);
        row.put(SheetField.ROUTE, route);
        row.put(SheetField.TONNAGE, tonnage);
        row.put(SheetField.CARGO, cargo);
        row.put(SheetField.DATE, date);
        row.put(SheetField.FREIGHT, freight);
        rows.add(row);
        return FIRST_ROW + rows.size() - 1;
    }

    public synchronized SheetRow row(int rowNumber) {
        return new SheetRow(rowNumber, rows.get(rowNumber - FIRST_ROW));
    }

    public synchronized List<SheetRow> rows() {
        return readRows();
    }

    public synchronized int writeCalls() {
        return writeCalls;
    }

    public synchronized void clear() {
        rows.clear();
        writeCalls = 0;
    }

    @Override
    public synchronized List<SheetRow> readRows() {
        var result = new ArrayList<SheetRow>();
        for (var i = 0; i < rows.size(); i++) {
            var row = new SheetRow(FIRST_ROW + i, rows.get(i));
            if (!row.isEmpty()) {
                result.add(row);
            }
        }
        return result;
    }

    @Override
    public synchronized void write(List<CellWrite> writes) {
        if (writes.isEmpty()) {
            return;
        }
        writeCalls++;
        for (var write : writes) {
            rows.get(write.rowNumber() - FIRST_ROW).put(write.field(), write.value());
            log.info("FAKE SHEET row={} {}={}", write.rowNumber(), write.field(), write.value());
        }
    }
}
