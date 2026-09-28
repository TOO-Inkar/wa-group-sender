package kz.wasender.whatsapp;

import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

public interface WhatsAppGateway {

    void connect();

    void disconnect();

    SessionState sessionState();

    /**
     * Whether the underlying socket is really open. The session state follows library events,
     * and a socket that closes without a disconnect event would otherwise stay CONNECTED forever.
     */
    default boolean transportAlive() {
        return true;
    }

    Optional<String> currentQr();

    List<GroupInfo> listGroups();

    void sendText(String groupJid, String text) throws SendException;

    void sendTyping(String groupJid, boolean typing);

    void subscribe(Consumer<GatewayEvent> listener);
}
