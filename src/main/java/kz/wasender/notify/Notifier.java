package kz.wasender.notify;

public interface Notifier {
    String name();

    boolean configured();

    int send(String text);
}
