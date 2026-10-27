package kz.wasender.whatsapp.fake;

import kz.wasender.config.FakeProperties;
import kz.wasender.whatsapp.AbstractWhatsAppGateway;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.ProxyPolicy;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.random.RandomGenerator;

@Component
@Profile("fake")
public class FakeWhatsAppGateway extends AbstractWhatsAppGateway {
    private static final Logger log = LoggerFactory.getLogger(FakeWhatsAppGateway.class);

    private final FakeProperties properties;
    private final RandomGenerator random;
    private final List<GroupInfo> groups = new CopyOnWriteArrayList<>();
    private final List<SentMessage> sent = new CopyOnWriteArrayList<>();
    private final List<String> typing = new CopyOnWriteArrayList<>();
    private final Set<String> failing = ConcurrentHashMap.newKeySet();
    private final Map<String, Integer> rejecting = new ConcurrentHashMap<>();
    private final Map<String, LastMessage> last = new ConcurrentHashMap<>();
    private final List<SentMessage> direct = new CopyOnWriteArrayList<>();
    private final List<String> rejectedCalls = new CopyOnWriteArrayList<>();
    private final Clock clock;
    private final ProxyPolicy proxies;

    public FakeWhatsAppGateway(FakeProperties properties, RandomGenerator random, Clock clock, ProxyPolicy proxies) {
        this.properties = properties;
        this.random = random;
        this.clock = clock;
        this.proxies = proxies;
        resetGroups();
    }

    @Override
    public void connect() {
        if (proxies.missing()) {
            updateState(SessionState.PROXY_REQUIRED);
            return;
        }
        updateState(SessionState.CONNECTING);
        publish(new GatewayEvent.Connected());
    }

    @Override
    public void disconnect() {
        publish(new GatewayEvent.Disconnected("fake disconnect", false));
    }

    @Override
    public List<GroupInfo> listGroups() {
        if (sessionState() != SessionState.CONNECTED) {
            throw new IllegalStateException("not connected");
        }
        return List.copyOf(groups);
    }

    @Override
    public void sendText(String groupJid, String text) throws SendException {
        if (sessionState() != SessionState.CONNECTED) {
            throw SendException.connectionLost("not connected", null);
        }
        if (failing.contains(groupJid)) {
            throw new SendException("fake failure for " + groupJid, false, null);
        }
        if (rejecting.merge(groupJid, -1, Integer::sum) >= 0) {
            throw new SendException("server returned error 479", false, true, false, null);
        }
        if (properties.failureRate() > 0 && random.nextDouble() < properties.failureRate()) {
            throw new SendException("fake random failure", false, null);
        }
        if (!groupJid.endsWith("@g.us")) {
            direct.add(new SentMessage(groupJid, text));
            return;
        }
        sent.add(new SentMessage(groupJid, text));
        last.put(groupJid, new LastMessage(true, Instant.now(clock)));
        log.debug("FAKE sent group_jid={}", groupJid);
    }

    @Override
    public Optional<LastMessage> lastMessage(String groupJid) {
        return Optional.ofNullable(last.get(groupJid));
    }

    @Override
    public void rejectCall(String fromJid, String callId) {
        rejectedCalls.add(callId);
    }

    public void simulateForeignMessage(String groupJid) {
        last.put(groupJid, new LastMessage(false, Instant.now(clock)));
    }

    public void simulateDirectMessage(String chatJid, String name) {
        publish(new GatewayEvent.DirectMessage(chatJid, name));
    }

    public void simulateCall(String fromJid, String callId) {
        publish(new GatewayEvent.IncomingCall(fromJid, callId));
    }

    public List<SentMessage> direct() {
        return List.copyOf(direct);
    }

    public List<String> rejectedCalls() {
        return List.copyOf(rejectedCalls);
    }

    @Override
    public void sendTyping(String groupJid, boolean on) {
        if (on) {
            typing.add(groupJid);
        }
    }

    public List<SentMessage> sent() {
        return List.copyOf(sent);
    }

    public List<String> typing() {
        return List.copyOf(typing);
    }

    public void reset() {
        sent.clear();
        typing.clear();
        failing.clear();
        last.clear();
        direct.clear();
        rejectedCalls.clear();
        resetGroups();
    }

    public void rejectFor(String groupJid, int times) {
        rejecting.put(groupJid, times);
    }

    public void stopFailing(String groupJid) {
        failing.remove(groupJid);
    }

    public void failFor(String groupJid) {
        failing.add(groupJid);
    }

    public void replaceGroups(List<GroupInfo> newGroups) {
        groups.clear();
        groups.addAll(newGroups);
    }

    public void simulateDisconnect(boolean autoReconnect) {
        publish(new GatewayEvent.Disconnected("simulated", autoReconnect));
    }

    public void simulateRemoval(String groupJid) {
        publish(new GatewayEvent.RemovedFromGroup(groupJid));
    }

    public void simulateLogout() {
        publish(new GatewayEvent.LoggedOut());
    }

    private void resetGroups() {
        groups.clear();
        for (var i = 1; i <= properties.groups(); i++) {
            var archived = i > properties.unarchivedGroups();
            var adminOnly = archived && i <= properties.unarchivedGroups() + properties.adminOnlyGroups();
            groups.add(new GroupInfo("1203630000%05d@g.us".formatted(i), "Тестовая группа " + i, archived,
                    archived ? Boolean.TRUE : null, archived ? !adminOnly : null));
        }
    }

    public record SentMessage(String groupJid, String text) {
    }
}
