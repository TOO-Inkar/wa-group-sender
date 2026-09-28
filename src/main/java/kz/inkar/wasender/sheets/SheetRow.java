package kz.inkar.wasender.sheets;

import java.util.EnumMap;
import java.util.Map;

public record SheetRow(int rowNumber, Map<SheetField, String> values) {

    public SheetRow {
        var copy = new EnumMap<SheetField, String>(SheetField.class);
        values.forEach((field, value) -> copy.put(field, value == null ? "" : value.strip()));
        values = Map.copyOf(copy);
    }

    public String get(SheetField field) {
        return values.getOrDefault(field, "");
    }

    public boolean isBlank(SheetField field) {
        return get(field).isBlank();
    }

    public boolean isEmpty() {
        return values.values().stream().allMatch(String::isBlank);
    }

    public SheetRow with(SheetField field, String value) {
        var copy = new EnumMap<SheetField, String>(SheetField.class);
        copy.putAll(values);
        copy.put(field, value);
        return new SheetRow(rowNumber, copy);
    }
}
