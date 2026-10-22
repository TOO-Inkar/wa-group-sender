package kz.wasender.whatsapp;

public class SendException extends Exception {
    private final boolean groupUnavailable;
    private final boolean rejectedByServer;
    private final boolean connectionLost;

    public SendException(String message, boolean groupUnavailable, Throwable cause) {
        this(message, groupUnavailable, false, false, cause);
    }

    public SendException(String message, boolean groupUnavailable, boolean rejectedByServer, boolean connectionLost, Throwable cause) {
        super(message, cause);
        this.groupUnavailable = groupUnavailable;
        this.rejectedByServer = rejectedByServer;
        this.connectionLost = connectionLost;
    }

    public static SendException connectionLost(String message, Throwable cause) {
        return new SendException(message, false, false, true, cause);
    }

    public boolean groupUnavailable() {
        return groupUnavailable;
    }

    public boolean rejectedByServer() {
        return rejectedByServer;
    }

    public boolean connectionLost() {
        return connectionLost;
    }
}
