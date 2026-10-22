package kz.wasender.whatsapp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

public abstract class AbstractWhatsAppGateway implements WhatsAppGateway {

    private static final Logger log = LoggerFactory.getLogger(AbstractWhatsAppGateway.class);

    private final List<Consumer<GatewayEvent>> listeners = new CopyOnWriteArrayList<>();
    private volatile SessionState state = SessionState.STARTING;
    private volatile String qr;

    @Override
    public SessionState sessionState() {
        return state;
    }

    @Override
    public Optional<String> currentQr() {
        return Optional.ofNullable(qr);
    }

    @Override
    public void subscribe(Consumer<GatewayEvent> listener) {
        listeners.add(listener);
    }

    protected void updateState(SessionState newState) {
        if (state != newState) {
            log.info("SESSION state {} -> {}", state, newState);
            state = newState;
        }
        if (newState != SessionState.WAITING_QR) {
            qr = null;
        }
    }

    protected void publish(GatewayEvent event) {
        switch (event) {
            case GatewayEvent.QrReceived received -> {
                updateState(SessionState.WAITING_QR);
                qr = received.payload();
            }
            case GatewayEvent.Connected ignored -> updateState(SessionState.CONNECTED);
            case GatewayEvent.Disconnected disconnected ->
                    updateState(disconnected.autoReconnect() ? SessionState.RECONNECTING : SessionState.DISCONNECTED);
            case GatewayEvent.LoggedOut ignored -> updateState(SessionState.LOGGED_OUT);
            case GatewayEvent.Banned ignored -> updateState(SessionState.BANNED);
            case GatewayEvent.RemovedFromGroup ignored -> {
            }
            case GatewayEvent.DirectMessage ignored -> {
            }
            case GatewayEvent.IncomingCall ignored -> {
            }
        }
        for (var listener : listeners) {
            try {
                listener.accept(event);
            } catch (RuntimeException e) {
                log.error("Gateway listener failed on {}", event, e);
            }
        }
    }
}
