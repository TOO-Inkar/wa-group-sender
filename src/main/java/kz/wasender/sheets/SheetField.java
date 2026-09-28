package kz.wasender.sheets;

import java.util.List;

public enum SheetField {
    ID("ID"),
    ROUTE("Маршрут"),
    DATE("Дата / срочность"),
    VEHICLES("Машины и тоннаж"),
    CARGO("Груз"),
    FREIGHT("Фрахт"),
    CONDITIONS("Доп. условия"),
    STATUS("Статус"),
    PROGRESS("Отправлено / всего"),
    COMPLETED("Завершено");

    public static final List<SheetField> REQUIRED = List.of(ROUTE, DATE, VEHICLES, CARGO, FREIGHT);
    public static final List<SheetField> CONTENT = List.of(ID, ROUTE, DATE, VEHICLES, CARGO, FREIGHT, CONDITIONS);

    private final String title;

    SheetField(String title) {
        this.title = title;
    }

    public String title() {
        return title;
    }
}
