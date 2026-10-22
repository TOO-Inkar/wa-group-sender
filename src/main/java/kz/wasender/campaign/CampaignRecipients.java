package kz.wasender.campaign;

import kz.wasender.group.GroupListRepository;
import kz.wasender.group.GroupRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class CampaignRecipients {
    private static final int MAX_LABEL = 500;
    private static final int NAMES_IN_LABEL = 3;

    private final CampaignRepository campaigns;
    private final GroupRepository groups;
    private final GroupListRepository groupLists;

    public CampaignRecipients(CampaignRepository campaigns, GroupRepository groups, GroupListRepository groupLists) {
        this.campaigns = campaigns;
        this.groups = groups;
        this.groupLists = groupLists;
    }

    @Nullable
    String labelToStore(@Nullable String requested, List<String> targets) {
        if (targets.isEmpty()) {
            return null;
        }
        var label = requested != null && !requested.isBlank() ? requested.strip() : describe(targets, groups.namesByJid());
        return label.length() > MAX_LABEL ? label.substring(0, MAX_LABEL - 1) + "…" : label;
    }

    public Recipients of(CampaignRecord campaign) {
        if (!campaign.targeted()) {
            return new Recipients(campaign.targetLabel(), List.of());
        }
        var targets = campaigns.targets(campaign.id());
        var names = groups.namesByJid();
        var named = targets.stream().map(jid -> new NamedGroup(jid, names.getOrDefault(jid, jid))).toList();
        return new Recipients(displayLabel(campaign.targetLabel(), targets, names), named);
    }

    // Заявки до сохранения подписи: показываем имя списка с теми же группами.
    private String displayLabel(@Nullable String stored, List<String> targets, Map<String, String> names) {
        if (stored != null && !stored.isBlank()) {
            return stored;
        }
        var set = new HashSet<>(targets);
        return groupLists.findAll().stream()
                .filter(list -> new HashSet<>(list.groups()).equals(set))
                .map(GroupListRepository.GroupList::name)
                .findFirst()
                .orElseGet(() -> describe(targets, names));
    }

    private static String describe(List<String> targets, Map<String, String> names) {
        var shown = targets.stream().limit(NAMES_IN_LABEL).map(jid -> names.getOrDefault(jid, jid)).collect(Collectors.joining(", "));
        return targets.size() > NAMES_IN_LABEL ? shown + " и ещё " + (targets.size() - NAMES_IN_LABEL) : shown;
    }

    public record Recipients(@Nullable String label, List<NamedGroup> groups) {
    }

    public record NamedGroup(String jid, String name) {
    }
}
