package kz.wasender.sheets;

import kz.wasender.config.SheetsProperties;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

public class ColumnLayout {

    private final Map<SheetField, Integer> indexes = new EnumMap<>(SheetField.class);

    public ColumnLayout(SheetsProperties.Columns columns) {
        put(SheetField.ID, columns.id());
        put(SheetField.ROUTE, columns.route());
        put(SheetField.TONNAGE, columns.tonnage());
        put(SheetField.CARGO, columns.cargo());
        put(SheetField.DATE, columns.date());
        put(SheetField.FREIGHT, columns.freight());
        put(SheetField.STATUS, columns.status());
        put(SheetField.PROGRESS, columns.progress());
        put(SheetField.COMPLETED, columns.completed());
    }

    public int index(SheetField field) {
        return indexes.get(field);
    }

    public String letter(SheetField field) {
        return toLetter(index(field));
    }

    public String lastLetter() {
        return toLetter(indexes.values().stream().mapToInt(Integer::intValue).max().orElse(0));
    }

    public static int toIndex(String letters) {
        var value = 0;
        for (var ch : letters.strip().toUpperCase(Locale.ROOT).toCharArray()) {
            if (ch < 'A' || ch > 'Z') {
                throw new IllegalArgumentException("Invalid column: " + letters);
            }
            value = value * 26 + (ch - 'A' + 1);
        }
        return value - 1;
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

    private void put(SheetField field, String letters) {
        indexes.put(field, toIndex(letters));
    }
}
