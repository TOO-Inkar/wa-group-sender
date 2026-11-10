package kz.wasender.whatsapp;

import kz.wasender.config.WatchdogProperties;
import kz.wasender.notify.AlertService;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.risk.RiskType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

@Component
public class SessionWatchdog {
    private static final Logger log = LoggerFactory.getLogger(SessionWatchdog.class);
    private static final int DEAD_TRANSPORT_CHECKS = 2;
    private static final String RECONNECT_EXHAUSTED = "Нет связи с WhatsApp уже %d попыток подряд, сообщения не уходят. "
            + "Проверьте, что телефон включён и в нём работает интернет. Если не поможет — откройте «Подключение» в админке.";
    private static final String RECONNECT_RESTORED = "Связь с WhatsApp восстановлена.";
    private static final String QR_REQUIRED = "WhatsApp ждёт привязки номера. Откройте «Подключение» в админке и отсканируйте QR "
            + "телефоном: WhatsApp → «Связанные устройства».";
    private static final String LOGGED_OUT = "WhatsApp отвязал номер, сообщения не уходят. Откройте «Подключение» в админке "
            + "и отсканируйте QR заново.";

    private final WhatsAppGateway gateway;
    private final WatchdogProperties properties;
    private final AlertService alerts;
    private final RiskMonitor risk;
    private final Clock clock;

    private int attempts;
    private Instant nextAttemptAt;
    private Instant stateSince;
    private SessionState lastState;
    private boolean pairing;
    private boolean exhausted;
    private int deadTransportChecks;

    public SessionWatchdog(WhatsAppGateway gateway, WatchdogProperties properties, AlertService alerts, RiskMonitor risk, Clock clock) {
        this.gateway = gateway;
        this.properties = properties;
        this.alerts = alerts;
        this.risk = risk;
        this.clock = clock;
        gateway.subscribe(this::onEvent);
    }

    public synchronized void start() {
        log.info("WATCHDOG starting WhatsApp session");
        gateway.connect();
    }

    public synchronized int attempts() {
        return attempts;
    }

    public synchronized Instant nextAttemptAt() {
        return nextAttemptAt;
    }

    public synchronized void check() {
        var now = Instant.now(clock);
        var state = gateway.sessionState();
        if (state != lastState) {
            lastState = state;
            stateSince = now;
        }
        if (state == SessionState.PROXY_REQUIRED) {
            gateway.connect();
            return;
        }
        var stuck = (state == SessionState.CONNECTING || state == SessionState.RECONNECTING)
                && Duration.between(stateSince, now).compareTo(properties.connectTimeout()) > 0;
        if (state == SessionState.CONNECTED && !gateway.transportAlive()) {
            if (++deadTransportChecks >= DEAD_TRANSPORT_CHECKS) {
                deadTransportChecks = 0;
                log.warn("WATCHDOG session is CONNECTED but the socket is closed, reconnecting");
                risk.record(RiskType.DISCONNECTED, null, null, "socket closed without disconnect event");
                lastState = null;
                gateway.connect();
            }
            return;
        }
        deadTransportChecks = 0;
        if (stuck && nextAttemptAt == null) {
            log.warn("WATCHDOG session stuck in {} for more than {}", state, properties.connectTimeout());
            schedule(now);
        }
        if (nextAttemptAt == null || now.isBefore(nextAttemptAt)) {
            return;
        }
        nextAttemptAt = null;
        if (state == SessionState.CONNECTED || state == SessionState.BANNED) {
            return;
        }
        if (!pairing) {
            attempts++;
        }
        log.warn("WATCHDOG reconnect attempt {}/{}", attempts, properties.maxAttempts());
        if (attempts >= properties.maxAttempts() && !exhausted) {
            exhausted = true;
            alerts.alert("reconnect-exhausted", RECONNECT_EXHAUSTED.formatted(attempts));
        }
        lastState = null;
        gateway.connect();
    }

    Duration delayFor(int attempt) {
        var delay = properties.initialDelay();
        for (var i = 0; i < attempt && delay.compareTo(properties.maxDelay()) < 0; i++) {
            delay = delay.multipliedBy(2);
        }
        return delay.compareTo(properties.maxDelay()) > 0 ? properties.maxDelay() : delay;
    }

    private synchronized void onEvent(GatewayEvent event) {
        var now = Instant.now(clock);
        switch (event) {
            case GatewayEvent.Connected ignored -> {
                if (attempts > 0) {
                    log.info("WATCHDOG session restored after {} attempts", attempts);
                }
                if (exhausted) {
                    alerts.alert("reconnect-restored", RECONNECT_RESTORED);
                }
                attempts = 0;
                exhausted = false;
                pairing = false;
                nextAttemptAt = null;
            }
            case GatewayEvent.QrReceived ignored -> {
                if (!pairing) {
                    alerts.alert("qr-required", QR_REQUIRED);
                }
                pairing = true;
            }
            case GatewayEvent.Disconnected disconnected -> {
                if (!pairing) {
                    risk.record(RiskType.DISCONNECTED, null, null, disconnected.reason());
                }
                if (!disconnected.autoReconnect()) {
                    schedule(now);
                }
            }
            case GatewayEvent.LoggedOut ignored -> {
                risk.record(RiskType.LOGGED_OUT, null, null, "logged out");
                alerts.alert("logged-out", LOGGED_OUT);
                pairing = true;
                nextAttemptAt = now.plus(properties.initialDelay());
            }
            case GatewayEvent.Banned ignored -> {
                risk.record(RiskType.BANNED, null, null, "banned");
                risk.stop("номер заблокирован WhatsApp");
                nextAttemptAt = null;
            }
            case GatewayEvent.RemovedFromGroup ignored -> {
            }
            case GatewayEvent.DirectMessage ignored -> {
            }
            case GatewayEvent.IncomingCall ignored -> {
            }
        }
    }

    private void schedule(Instant now) {
        if (nextAttemptAt != null) {
            return;
        }
        var delay = pairing ? properties.initialDelay() : delayFor(attempts);
        nextAttemptAt = now.plus(delay);
        log.info("WATCHDOG next reconnect in {}", delay);
    }
}
