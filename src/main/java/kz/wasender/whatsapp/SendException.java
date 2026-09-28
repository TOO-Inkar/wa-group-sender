package kz.wasender.whatsapp;

public class SendException extends Exception {

    private final boolean groupUnavailable;

    public SendException(String message, boolean groupUnavailable, Throwable cause) {
        super(message, cause);
        this.groupUnavailable = groupUnavailable;
    }

    public boolean groupUnavailable() {
        return groupUnavailable;
    }
}
