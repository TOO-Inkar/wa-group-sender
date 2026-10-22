package kz.wasender.request;

public enum RequestStatus {
    QUEUED("В очереди"),
    SENDING("Отправляется"),
    DONE("Отправлено"),
    FAILED("Ошибка");

    private final String sheetText;

    RequestStatus(String sheetText) {
        this.sheetText = sheetText;
    }

    public boolean active() {
        return this == QUEUED || this == SENDING;
    }

    public String sheetText() {
        return sheetText;
    }
}
