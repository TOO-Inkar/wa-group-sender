package kz.wasender.whatsapp.fake;

import kz.wasender.config.FakeProperties;
import kz.wasender.whatsapp.AbstractWhatsAppGateway;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
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

    public FakeWhatsAppGateway(FakeProperties properties, RandomGenerator random) {
        this.properties = properties;
        this.random = random;
        resetGroups();
    }

    @Override
    public void connect() {
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
            throw new SendException("not connected", false, null);
        }
        if (failing.contains(groupJid)) {
            throw new SendException("fake failure for " + groupJid, false, null);
        }
        if (rejecting.merge(groupJid, -1, Integer::sum) >= 0) {
            throw new SendException("server returned error 479", false, true, null);
        }
        if (properties.failureRate() > 0 && random.nextDouble() < properties.failureRate()) {
            throw new SendException("fake random failure", false, null);
        }
        sent.add(new SentMessage(groupJid, text));
        log.debug("FAKE sent group_jid={}", groupJid);
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
        resetGroups();
    }

    /** The next {@code times} sends to the group are rejected by the server (error 479). */
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

    public void simulateQr(String payload) {
        publish(new GatewayEvent.QrReceived(payload));
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
