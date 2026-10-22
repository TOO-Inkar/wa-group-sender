package kz.wasender.whatsapp;

public sealed interface GatewayEvent {

    record QrReceived(String payload) implements GatewayEvent {
    }

    record Connected() implements GatewayEvent {
    }

    record Disconnected(String reason, boolean autoReconnect) implements GatewayEvent {
    }

    record LoggedOut() implements GatewayEvent {
    }

    record Banned() implements GatewayEvent {
    }

    record RemovedFromGroup(String groupJid) implements GatewayEvent {
    }

    /** Кто-то написал номеру в личку; name — имя из профиля WhatsApp, если есть. */
    record DirectMessage(String chatJid, String name) implements GatewayEvent {
    }

    /** Входящий звонок на номер. */
    record IncomingCall(String fromJid, String callId) implements GatewayEvent {
    }
}
