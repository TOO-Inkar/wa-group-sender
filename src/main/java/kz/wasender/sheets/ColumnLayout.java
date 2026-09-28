package kz.wasender.sheets;

import kz.wasender.config.SheetsProperties;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class ColumnLayout {

    private final Map<SheetField, Integer> indexes = new EnumMap<>(SheetField.class);
    private final List<String> missing = new ArrayList<>();

    public ColumnLayout(SheetsProperties.Columns columns, List<?> headerRow) {
        var headers = headerRow.stream().map(value -> normalize(String.valueOf(value))).toList();
        for (var field : SheetField.values()) {
            var index = headers.indexOf(normalize(columns.header(field)));
            if (index < 0) {
                missing.add(columns.header(field));
            } else {
                indexes.put(field, index);
            }
        }
    }

    public List<String> missing() {
        return List.copyOf(missing);
    }

    public ColumnLayout requireComplete() {
        if (!missing.isEmpty()) {
            throw new SheetLayoutException(missing);
        }
        return this;
    }

    public int index(SheetField field) {
        return indexes.get(field);
    }

    public String letter(SheetField field) {
        return toLetter(index(field));
    }

    public List<SheetRow> rows(List<? extends List<?>> values, int headerRow) {
        var rows = new ArrayList<SheetRow>();
        for (var i = headerRow; i < values.size(); i++) {
            var cells = values.get(i);
            var map = new EnumMap<SheetField, String>(SheetField.class);
            for (var field : SheetField.values()) {
                var index = index(field);
                map.put(field, index < cells.size() && cells.get(index) != null ? String.valueOf(cells.get(index)) : "");
            }
            var row = new SheetRow(i + 1, map);
            if (!row.isEmpty()) {
                rows.add(row);
            }
        }
        return rows;
    }

    public static String toLetter(int index) {
        var builder = new StringBuilder();
        var value = index + 1;
        while (value > 0) {
            var remainder = (value - 1)%26;
            builder.insert(0, (char) ('A' + remainder));
            value = (value - 1) / 26;
        }
        return builder.toString();
    }

    public static String normalize(String header) {
        return header == null ? "" : header.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
