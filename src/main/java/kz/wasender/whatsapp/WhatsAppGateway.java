package kz.wasender.whatsapp;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

public interface WhatsAppGateway {
    void connect();

    void disconnect();

    SessionState sessionState();

    // Состояние идёт по событиям библиотеки; сокет, закрытый без события, иначе навсегда остался бы CONNECTED.
    default boolean transportAlive() {
        return true;
    }

    Optional<String> currentQr();

    List<GroupInfo> listGroups();

    void sendText(String groupJid, String text) throws SendException;

    void sendTyping(String groupJid, boolean typing);

    void subscribe(Consumer<GatewayEvent> listener);

    default Optional<LastMessage> lastMessage(String groupJid) {
        return Optional.empty();
    }

    default void sendDirect(String chatJid, String text) throws SendException {
        sendText(chatJid, text);
    }

    default void rejectCall(String fromJid, String callId) {
    }

    // Пусто — у группы нет фото; IllegalStateException — WhatsApp сейчас не ответил.
    default Optional<byte[]> groupPicture(String groupJid) {
        return Optional.empty();
    }

    record LastMessage(boolean fromMe, Instant at) {
    }
}
