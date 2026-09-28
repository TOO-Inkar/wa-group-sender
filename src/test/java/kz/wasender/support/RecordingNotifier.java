package kz.wasender.support;

import kz.wasender.notify.Notifier;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class RecordingNotifier implements Notifier {

    private final List<String> messages = new CopyOnWriteArrayList<>();

    @Override
    public String channel() {
        return "test";
    }

    @Override
    public boolean configured() {
        return true;
    }

    @Override
    public void send(String text) {
        messages.add(text);
    }

    public List<String> messages() {
        return List.copyOf(messages);
    }

    public boolean anyContains(String fragment) {
        return messages.stream().anyMatch(message -> message.contains(fragment));
    }
}
