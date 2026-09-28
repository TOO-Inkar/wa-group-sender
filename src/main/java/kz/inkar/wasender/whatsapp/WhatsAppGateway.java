package kz.inkar.wasender.whatsapp;

import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

public interface WhatsAppGateway {

    void connect();

    void disconnect();

    SessionState sessionState();

    Optional<String> currentQr();

    List<GroupInfo> listGroups();

    void sendText(String groupJid, String text) throws SendException;

    void sendTyping(String groupJid, boolean typing);

    void subscribe(Consumer<GatewayEvent> listener);
}
