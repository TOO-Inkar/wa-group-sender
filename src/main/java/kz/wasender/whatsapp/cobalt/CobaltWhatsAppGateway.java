package kz.wasender.whatsapp.cobalt;

import it.auties.whatsapp.api.DisconnectReason;
import it.auties.whatsapp.api.ErrorHandler;
import it.auties.whatsapp.api.QrHandler;
import it.auties.whatsapp.api.TextPreviewSetting;
import it.auties.whatsapp.api.WebHistorySetting;
import it.auties.whatsapp.api.Whatsapp;
import it.auties.whatsapp.controller.ControllerSerializer;
import it.auties.whatsapp.exception.HmacValidationException;
import it.auties.whatsapp.exception.RequestException;
import it.auties.whatsapp.model.chat.Chat;
import it.auties.whatsapp.model.chat.ChatMetadata;
import it.auties.whatsapp.model.chat.ChatRole;
import it.auties.whatsapp.model.chat.ChatSettingPolicy;
import it.auties.whatsapp.model.chat.GroupSetting;
import it.auties.whatsapp.model.contact.ContactStatus;
import it.auties.whatsapp.model.info.ChatMessageInfo;
import it.auties.whatsapp.model.jid.Jid;
import it.auties.whatsapp.model.message.model.MessageContainer;
import it.auties.whatsapp.model.message.model.MessageStatus;
import kz.wasender.config.WhatsAppProperties;
import kz.wasender.whatsapp.AbstractWhatsAppGateway;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Component
@Profile("!fake")
public class CobaltWhatsAppGateway extends AbstractWhatsAppGateway {

    private static final Logger log = LoggerFactory.getLogger(CobaltWhatsAppGateway.class);
    private static final List<String> UNAVAILABLE_MARKERS = List.of("not-authorized", "forbidden", "403", "item-not-found", "404", "not-acceptable", "406");

    private final WhatsAppProperties properties;
    private final Clock clock;
    private final Map<String, CachedMetadata> metadataCache = new ConcurrentHashMap<>();
    private volatile Whatsapp whatsapp;

    public CobaltWhatsAppGateway(WhatsAppProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public synchronized void connect() {
        closeQuietly();
        if (sessionState() == SessionState.LOGGED_OUT) {
            wipeSession();
        }
        updateState(SessionState.CONNECTING);
        try {
            Files.createDirectories(properties.sessionDir());
        } catch (IOException e) {
            log.error("Cannot create session dir {}", properties.sessionDir(), e);
        }
        var client = Whatsapp.webBuilder()
                .serializer(ControllerSerializer.toProtobuf(properties.sessionDir()))
                .lastConnection()
                .name(properties.deviceName())
                .historySetting(historySetting())
                .textPreviewSetting(TextPreviewSetting.DISABLED)
                .errorHandler(this::handleError)
                .unregistered(QrHandler.toPlainString(payload -> publish(new GatewayEvent.QrReceived(payload))));
        client.addLoggedInListener(() -> {
            if (whatsapp == client) {
                publish(new GatewayEvent.Connected());
            }
        });
        client.addDisconnectedListener(reason -> {
            if (whatsapp == client) {
                onDisconnected(reason);
            }
        });
        client.addNewChatMessageListener(this::onMessage);
        whatsapp = client;
        client.connect().exceptionally(error -> {
            log.warn("Connect failed: {}", error.toString());
            if (whatsapp == client && sessionState() != SessionState.LOGGED_OUT && sessionState() != SessionState.BANNED) {
                publish(new GatewayEvent.Disconnected("connect failed: " + error.getMessage(), false));
            }
            return null;
        });
    }

    @Override
    public synchronized void disconnect() {
        closeQuietly();
        updateState(SessionState.DISCONNECTED);
    }

    private WebHistorySetting historySetting() {
        return switch (properties.history()) {
            case DISCARD -> WebHistorySetting.discard(false);
            case STANDARD -> WebHistorySetting.standard(false);
        };
    }

    @Override
    public boolean transportAlive() {
        var client = whatsapp;
        return client != null && client.isConnected();
    }

    @Override
    public List<GroupInfo> listGroups() {
        var client = requireClient();
        var self = selfUsers(client);
        var groups = new ArrayList<GroupInfo>();
        for (var chat : client.store().chats()) {
            if (!chat.isGroup()) {
                continue;
            }
            var jid = chat.jid().toString();
            if (!chat.archived()) {
                groups.add(new GroupInfo(jid, chat.name(), false, null, null));
                continue;
            }
            var metadata = metadata(client, chat, self);
            groups.add(new GroupInfo(jid, chat.name(), true, metadata.member(), metadata.canSend()));
        }
        return groups;
    }

    @Override
    public void sendText(String groupJid, String text) throws SendException {
        var client = requireClient();
        try {
            var info = client.sendChatMessage(Jid.of(groupJid), MessageContainer.of(text), false)
                    .get(properties.sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
            if (info.status() == MessageStatus.ERROR) {
                throw new SendException("message status ERROR", false, null);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SendException("interrupted", false, e);
        } catch (ExecutionException e) {
            var cause = e.getCause() == null ? e : e.getCause();
            throw new SendException(String.valueOf(cause.getMessage()), unavailable(cause), cause);
        } catch (TimeoutException e) {
            throw new SendException("send timeout " + properties.sendTimeout(), false, e);
        } catch (RuntimeException e) {
            throw new SendException(String.valueOf(e.getMessage()), unavailable(e), e);
        }
    }

    @Override
    public void sendTyping(String groupJid, boolean typing) {
        if (!typing) {
            return;
        }
        try {
            requireClient().changePresence(Jid.of(groupJid), ContactStatus.COMPOSING)
                    .get(properties.sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Typing presence failed group_jid={}: {}", groupJid, e.toString());
        }
    }

    private void onDisconnected(DisconnectReason reason) {
        log.warn("Cobalt disconnected reason={}", reason);
        switch (reason) {
            case LOGGED_OUT -> publish(new GatewayEvent.LoggedOut());
            case BANNED -> publish(new GatewayEvent.Banned());
            case RECONNECTING -> publish(new GatewayEvent.Disconnected("reconnecting", true));
            case DISCONNECTED -> {
                if (sessionState() != SessionState.DISCONNECTED) {
                    publish(new GatewayEvent.Disconnected("disconnected", false));
                }
            }
        }
    }

    private void onMessage(ChatMessageInfo info) {
        var stub = info.stubType();
        if (stub.isEmpty() || !info.chatJid().toString().endsWith("@g.us")) {
            return;
        }
        var groupJid = info.chatJid().toString();
        metadataCache.remove(groupJid);
        var type = stub.get();
        if (type != ChatMessageInfo.StubType.GROUP_PARTICIPANT_REMOVE && type != ChatMessageInfo.StubType.GROUP_PARTICIPANT_LEAVE) {
            return;
        }
        var client = whatsapp;
        if (client == null) {
            return;
        }
        var self = selfUsers(client);
        var affectsSelf = info.stubParameters().stream().anyMatch(parameter -> self.contains(userOf(parameter)));
        if (affectsSelf) {
            publish(new GatewayEvent.RemovedFromGroup(groupJid));
        }
    }

    private ErrorHandler.Result handleError(Whatsapp client, ErrorHandler.Location location, Throwable error) {
        log.warn("Cobalt error at {}: {}", location, error.toString());
        if (location == ErrorHandler.Location.RECONNECT) {
            return ErrorHandler.Result.DISCARD;
        }
        // Cobalt asks for account props at login and the request often times out. Disconnecting on that
        // closes a working session silently, the watchdog reconnects, and every login ends the same way.
        if (location == ErrorHandler.Location.LOGIN
                && (error instanceof RequestException || error.getCause() instanceof RequestException)) {
            return ErrorHandler.Result.DISCARD;
        }
        if (location == ErrorHandler.Location.LOGIN
                || location == ErrorHandler.Location.INITIAL_APP_STATE_SYNC
                || location == ErrorHandler.Location.CRYPTOGRAPHY
                || (location == ErrorHandler.Location.MESSAGE && error instanceof HmacValidationException)) {
            return ErrorHandler.Result.DISCONNECT;
        }
        return ErrorHandler.Result.DISCARD;
    }

    private CachedMetadata metadata(Whatsapp client, Chat chat, Set<String> self) {
        var jid = chat.jid().toString();
        var cached = metadataCache.get(jid);
        var now = Instant.now(clock);
        if (cached != null && cached.checkedAt().plus(properties.metadataTtl()).isAfter(now)) {
            return cached;
        }
        CachedMetadata result;
        try {
            var metadata = client.queryGroupMetadata(chat.jid()).get(properties.sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
            result = evaluate(metadata, self, now);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new CachedMetadata(null, null, now);
        } catch (Exception e) {
            var cause = e.getCause() == null ? e : e.getCause();
            log.warn("Group metadata failed group_jid={}: {}", jid, cause.toString());
            result = unavailable(cause) ? new CachedMetadata(false, false, now) : new CachedMetadata(null, null, now);
        }
        if (result.member() != null) {
            metadataCache.put(jid, result);
        }
        pause();
        return result;
    }

    private CachedMetadata evaluate(ChatMetadata metadata, Set<String> self, Instant now) {
        if (metadata.isCommunity()) {
            return new CachedMetadata(true, false, now);
        }
        var participant = metadata.participants().stream()
                .filter(candidate -> self.contains(candidate.jid().user()))
                .findFirst();
        if (participant.isEmpty()) {
            return new CachedMetadata(false, false, now);
        }
        var adminsOnly = metadata.getPolicy(GroupSetting.SEND_MESSAGES).orElse(ChatSettingPolicy.ANYONE) == ChatSettingPolicy.ADMINS;
        var role = participant.get().role();
        var canSend = !adminsOnly || role == ChatRole.ADMIN || role == ChatRole.FOUNDER;
        return new CachedMetadata(true, canSend, now);
    }

    private void pause() {
        try {
            Thread.sleep(properties.metadataQueryDelay());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private Set<String> selfUsers(Whatsapp client) {
        var users = new HashSet<String>();
        client.store().jid().map(Jid::user).ifPresent(users::add);
        client.store().lid().map(Jid::user).ifPresent(users::add);
        return users;
    }

    private static String userOf(String jid) {
        var end = jid.indexOf('@');
        var user = end < 0 ? jid : jid.substring(0, end);
        var device = user.indexOf(':');
        return device < 0 ? user : user.substring(0, device);
    }

    private static boolean unavailable(Throwable error) {
        var text = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
        return UNAVAILABLE_MARKERS.stream().anyMatch(text::contains);
    }

    private Whatsapp requireClient() {
        var client = whatsapp;
        if (client == null || sessionState() != SessionState.CONNECTED) {
            throw new IllegalStateException("WhatsApp session is not connected: " + sessionState());
        }
        return client;
    }

    private void closeQuietly() {
        var client = whatsapp;
        whatsapp = null;
        if (client == null) {
            return;
        }
        try {
            client.disconnect().get(30, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.debug("Disconnect failed: {}", e.toString());
        }
    }

    private void wipeSession() {
        try {
            FileSystemUtils.deleteRecursively(properties.sessionDir());
            metadataCache.clear();
            log.warn("SESSION wiped after logout, new QR pairing required dir={}", properties.sessionDir());
        } catch (IOException e) {
            log.error("Cannot wipe session dir {}", properties.sessionDir(), e);
        }
    }

    private record CachedMetadata(Boolean member, Boolean canSend, Instant checkedAt) {
    }
}
