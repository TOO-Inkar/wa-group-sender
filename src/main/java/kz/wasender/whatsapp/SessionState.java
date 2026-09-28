package kz.wasender.whatsapp;

public enum SessionState {
    STARTING,
    CONNECTING,
    WAITING_QR,
    CONNECTED,
    RECONNECTING,
    DISCONNECTED,
    LOGGED_OUT,
    BANNED
}
