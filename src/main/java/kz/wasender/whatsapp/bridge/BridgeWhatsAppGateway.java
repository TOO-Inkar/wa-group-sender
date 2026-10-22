package kz.wasender.whatsapp.bridge;

import jakarta.annotation.PreDestroy;
import kz.wasender.config.WhatsAppProperties;
import kz.wasender.whatsapp.AbstractWhatsAppGateway;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
@Profile("!fake")
public class BridgeWhatsAppGateway extends AbstractWhatsAppGateway {
    private static final Logger log = LoggerFactory.getLogger(BridgeWhatsAppGateway.class);
    private static final int EVENTS_WAIT_SECONDS = 20;
    private static final Duration RETRY_DELAY = Duration.ofSeconds(2);

    private final RestClient client;
    private final RestClient slowClient;
    private Thread poller;
    private volatile boolean stopped;

    @Autowired
    public BridgeWhatsAppGateway(WhatsAppProperties properties) {
        this(RestClient.builder().baseUrl(properties.bridgeUrl().toString())
                        .requestFactory(factory(properties.sendTimeout().plusSeconds(EVENTS_WAIT_SECONDS))),
                RestClient.builder().baseUrl(properties.bridgeUrl().toString())
                        .requestFactory(factory(properties.groupsTimeout())));
    }

    BridgeWhatsAppGateway(RestClient.Builder client, RestClient.Builder slowClient) {
        this.client = client.build();
        this.slowClient = slowClient.build();
    }

    private static JdkClientHttpRequestFactory factory(Duration readTimeout) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(readTimeout);
        return factory;
    }

    @Override
    public synchronized void connect() {
        updateState(SessionState.CONNECTING);
        try {
            if (poller == null) {
                // Курсор берётся до /connect, чтобы не потерять события самого подключения.
                var start = client.get().uri("/events?after=-1&wait=0").retrieve().body(EventBatch.class);
                poller = Thread.ofVirtual().name("wa-bridge-events").start(() -> poll(start.instance(), start.next()));
            }
            client.post().uri("/connect").retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Bridge connect failed: {}", e.toString());
            publish(new GatewayEvent.Disconnected("bridge unavailable: " + e.getMessage(), false));
        }
    }

    @Override
    public synchronized void disconnect() {
        try {
            client.post().uri("/disconnect").retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Bridge disconnect failed: {}", e.toString());
        }
        updateState(SessionState.DISCONNECTED);
    }

    @Override
    public boolean transportAlive() {
        try {
            var status = client.get().uri("/status").retrieve().body(Status.class);
            return status != null && Boolean.TRUE.equals(status.connected()) && "CONNECTED".equals(status.state());
        } catch (RestClientException e) {
            return false;
        }
    }

    @Override
    public List<GroupInfo> listGroups() {
        return slowClient.get().uri("/groups").retrieve().body(new ParameterizedTypeReference<List<GroupInfo>>() {
        });
    }

    @Override
    public void sendText(String groupJid, String text) throws SendException {
        try {
            client.post().uri("/send")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("jid", groupJid, "text", text))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            var error = bridgeError(e);
            throw new SendException(error.error(), Boolean.TRUE.equals(error.unavailable()), Boolean.TRUE.equals(error.rejected()), e);
        } catch (RestClientException e) {
            throw new SendException("bridge: " + e.getMessage(), false, e);
        }
    }

    @Override
    public Optional<LastMessage> lastMessage(String groupJid) {
        try {
            var last = client.get().uri("/last?jid={jid}", groupJid).retrieve().body(Last.class);
            if (last == null || !Boolean.TRUE.equals(last.known()) || last.at() == null) {
                return Optional.empty();
            }
            return Optional.of(new LastMessage(Boolean.TRUE.equals(last.fromMe()), Instant.ofEpochSecond(last.at())));
        } catch (RestClientException e) {
            log.debug("Last message unknown group_jid={}: {}", groupJid, e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void rejectCall(String fromJid, String callId) {
        try {
            client.post().uri("/reject-call")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("jid", fromJid, "callId", callId))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            log.warn("Reject call failed from={}: {}", fromJid, bridgeError(e).error());
        } catch (RestClientException e) {
            log.warn("Reject call failed from={}: {}", fromJid, e.toString());
        }
    }

    @Override
    public void sendTyping(String groupJid, boolean typing) {
        if (!typing) {
            return;
        }
        try {
            client.post().uri("/typing")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("jid", groupJid))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            log.warn("Typing presence failed group_jid={}: {}", groupJid, bridgeError(e).error());
        } catch (RestClientException e) {
            log.warn("Typing presence failed group_jid={}: {}", groupJid, e.toString());
        }
    }

    @PreDestroy
    void stop() {
        stopped = true;
        if (poller != null) {
            poller.interrupt();
        }
    }

    private void poll(String instance, long cursor) {
        while (!stopped) {
            try {
                var batch = client.get().uri("/events?after={after}&wait={wait}", cursor, EVENTS_WAIT_SECONDS)
                        .retrieve().body(EventBatch.class);
                if (batch == null) {
                    continue;
                }
                // Мост перезапустился и потерял сессию и события — переподключит watchdog.
                if (!batch.instance().equals(instance)) {
                    log.warn("Bridge restarted (instance {} -> {})", instance, batch.instance());
                    instance = batch.instance();
                    cursor = 0;
                    publish(new GatewayEvent.Disconnected("bridge restarted", false));
                    continue;
                }
                for (var event : batch.events()) {
                    handle(event);
                }
                cursor = batch.next();
            } catch (RuntimeException e) {
                if (stopped) {
                    return;
                }
                log.warn("Bridge events poll failed: {}", e.toString());
                try {
                    Thread.sleep(RETRY_DELAY);
                } catch (InterruptedException interrupted) {
                    return;
                }
            }
        }
    }

    void handle(Event event) {
        log.info("BRIDGE event seq={} type={} reason={} jid={}", event.seq(), event.type(), event.reason(), event.jid());
        switch (event.type()) {
            case "qr" -> publish(new GatewayEvent.QrReceived(event.payload()));
            case "connected" -> publish(new GatewayEvent.Connected());
            case "disconnected" -> publish(new GatewayEvent.Disconnected(event.reason(), Boolean.TRUE.equals(event.autoReconnect())));
            case "logged_out" -> publish(new GatewayEvent.LoggedOut());
            case "banned" -> publish(new GatewayEvent.Banned());
            case "removed_from_group" -> publish(new GatewayEvent.RemovedFromGroup(event.jid()));
            case "direct_message" -> publish(new GatewayEvent.DirectMessage(event.jid(), event.payload()));
            case "call" -> publish(new GatewayEvent.IncomingCall(event.jid(), event.payload()));
            default -> log.warn("Unknown bridge event {}", event);
        }
    }

    private static BridgeError bridgeError(RestClientResponseException e) {
        try {
            var error = e.getResponseBodyAs(BridgeError.class);
            if (error != null && error.error() != null) {
                return error;
            }
        } catch (RuntimeException ignored) {
        }
        return new BridgeError(e.getStatusCode() + " " + e.getResponseBodyAsString(), false, false);
    }

    // Boxed: Jackson 3 не принимает отсутствующее поле для примитива, а мост пустые поля не шлёт.
    record Event(long seq, String type, String payload, String reason, Boolean autoReconnect, String jid) {
    }

    record EventBatch(String instance, long next, List<Event> events) {
    }

    record Status(String state, Boolean connected) {
    }

    record Last(Boolean known, Boolean fromMe, Long at) {
    }

    record BridgeError(String error, Boolean unavailable, Boolean rejected) {
    }
}
