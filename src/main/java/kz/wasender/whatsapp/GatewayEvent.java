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
}
