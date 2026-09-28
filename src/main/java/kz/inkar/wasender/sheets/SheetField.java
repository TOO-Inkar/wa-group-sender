package kz.inkar.wasender.sheets;

import java.util.List;

public enum SheetField {
    ID("ID"),
    ROUTE("Маршрут"),
    TONNAGE("Тоннаж"),
    CARGO("Груз"),
    DATE("Дата"),
    FREIGHT("Фрахт"),
    STATUS("Статус"),
    PROGRESS("Отправлено / всего"),
    COMPLETED("Завершено");

    public static final List<SheetField> REQUIRED = List.of(ROUTE, TONNAGE, CARGO, DATE, FREIGHT);

    private final String title;

    SheetField(String title) {
        this.title = title;
    }

    public String title() {
        return title;
    }
}
