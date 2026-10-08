package kz.wasender.group;

import kz.wasender.config.GroupsProperties;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.risk.RiskType;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.SessionState;
import kz.wasender.whatsapp.WhatsAppGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class GroupSyncService {

    private static final Logger log = LoggerFactory.getLogger(GroupSyncService.class);

    private final WhatsAppGateway gateway;
    private final GroupRepository groups;
    private final RiskMonitor risk;
    private final GroupsProperties properties;
    private final TaskScheduler scheduler;
    private final Clock clock;

    public GroupSyncService(WhatsAppGateway gateway, GroupRepository groups, RiskMonitor risk, GroupsProperties properties,
                            TaskScheduler scheduler, Clock clock) {
        this.gateway = gateway;
        this.groups = groups;
        this.risk = risk;
        this.properties = properties;
        this.scheduler = scheduler;
        this.clock = clock;
        gateway.subscribe(this::onEvent);
    }

    public synchronized SyncResult sync() {
        if (gateway.sessionState() != SessionState.CONNECTED) {
            log.info("GROUPS sync skipped, session {}", gateway.sessionState());
            return new SyncResult(false, 0, 0, 0);
        }
        var now = Instant.now(clock);
        var fetched = gateway.listGroups();
        var before = groups.findAll().stream().collect(Collectors.toMap(GroupRecord::jid, Function.identity()));
        var previouslyActive = before.values().stream().filter(GroupRecord::active).count();
        if (fetched.isEmpty() && previouslyActive > 0) {
            log.warn("GROUPS sync returned no groups while {} are active, keeping previous list", previouslyActive);
            return new SyncResult(false, 0, 0, (int) previouslyActive);
        }
        var seen = new HashSet<String>();
        for (var fetchedGroup : fetched) {
            var previous = before.get(fetchedGroup.jid());
            var group = named(fetchedGroup, previous);
            seen.add(group.jid());
            var tooLarge = tooLarge(group);
            var rejected = previous != null && previous.rejected();
            var active = group.eligible() && !tooLarge && !rejected;
            groups.upsert(group, tooLarge, rejected, now);
            if (previous == null) {
                log.info("GROUP added group_jid={} name=\"{}\" archived={} member={} can_send={} participants={} community={} active={}",
                        group.jid(), group.name(), group.archived(), group.member(), group.canSend(), group.participants(), group.community(), active);
            } else if (previous.active() != active) {
                log.info("GROUP {} group_jid={} name=\"{}\" archived={} member={} can_send={} participants={} community={} too_large={}",
                        active ? "activated" : "deactivated", group.jid(), group.name(), group.archived(), group.member(), group.canSend(),
                        group.participants(), group.community(), tooLarge);
            } else if (previous.name() != null && !previous.name().equals(group.name())) {
                log.info("GROUP renamed group_jid={} from=\"{}\" to=\"{}\"", group.jid(), previous.name(), group.name());
            }
        }
        for (var previous : before.values()) {
            if (!seen.contains(previous.jid()) && previous.active()) {
                groups.deactivate(previous.jid(), now);
                log.info("GROUP deactivated group_jid={} name=\"{}\" reason=missing-from-chat-list", previous.jid(), previous.name());
            }
        }
        var archived = (int) fetched.stream().filter(group -> group.archived()).count();
        var active = (int) groups.activeCount();
        log.info("GROUPS sync done total={} archived={} active={}", fetched.size(), archived, active);
        return new SyncResult(true, fetched.size(), archived, active);
    }

    /** The server does not always send a group's name; a blank one must not erase the name already known. */
    private static GroupInfo named(GroupInfo group, GroupRecord previous) {
        var blank = group.name() == null || group.name().isBlank();
        if (!blank || previous == null || previous.name() == null || previous.name().isBlank()) {
            return group;
        }
        return new GroupInfo(group.jid(), previous.name(), group.archived(), group.member(), group.canSend(), group.participants(),
                group.community());
    }

    private boolean tooLarge(GroupInfo group) {
        return properties.maxParticipants() > 0 && group.participants() != null && group.participants() > properties.maxParticipants();
    }

    public void syncQuietly() {
        try {
            sync();
        } catch (RuntimeException e) {
            log.error("GROUPS sync failed: {}", e.toString());
        }
    }

    private void onEvent(GatewayEvent event) {
        switch (event) {
            case GatewayEvent.Connected ignored -> scheduler.schedule(this::syncQuietly, scheduler.getClock().instant().plus(properties.initialSyncDelay()));
            case GatewayEvent.RemovedFromGroup removed -> {
                groups.markRemoved(removed.groupJid(), Instant.now(clock));
                log.warn("GROUP removed group_jid={}", removed.groupJid());
                risk.record(RiskType.GROUP_REMOVED, removed.groupJid(), null, "number removed from group");
            }
            default -> {
            }
        }
    }

    public record SyncResult(boolean done, int total, int archived, int active) {
    }
}
