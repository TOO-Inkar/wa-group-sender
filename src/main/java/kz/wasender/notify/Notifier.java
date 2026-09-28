package kz.wasender.notify;

public interface Notifier {

    String channel();

    boolean configured();

    void send(String text) throws Exception;
}
