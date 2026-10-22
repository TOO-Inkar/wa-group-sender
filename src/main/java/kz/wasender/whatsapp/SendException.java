package kz.wasender.whatsapp;

public class SendException extends Exception {
    private final boolean groupUnavailable;
    private final boolean rejectedByServer;

    public SendException(String message, boolean groupUnavailable, Throwable cause) {
        this(message, groupUnavailable, false, cause);
    }

    public SendException(String message, boolean groupUnavailable, boolean rejectedByServer, Throwable cause) {
        super(message, cause);
        this.groupUnavailable = groupUnavailable;
        this.rejectedByServer = rejectedByServer;
    }

    public boolean groupUnavailable() {
        return groupUnavailable;
    }

    public boolean rejectedByServer() {
        return rejectedByServer;
    }
}
