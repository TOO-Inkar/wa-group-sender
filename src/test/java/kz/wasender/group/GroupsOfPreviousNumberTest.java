package kz.wasender.group;

import kz.wasender.support.IntegrationTest;
import kz.wasender.web.GroupController;
import kz.wasender.whatsapp.GroupInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GroupsOfPreviousNumberTest extends IntegrationTest {

    @Autowired
    GroupController controller;
    @Autowired
    GroupRepository groups;

    @Test
    void afterLinkingAnotherNumberOnlyItsGroupsAreShownAndSent() {
        gateway.replaceGroups(List.of(new GroupInfo("1@g.us", "Старый номер 1", true, true, true),
                new GroupInfo("2@g.us", "Старый номер 2", true, true, true)));
        groupSync.sync();

        gateway.replaceGroups(List.of(new GroupInfo("3@g.us", "Новый номер", true, true, true)));
        groupSync.sync();

        assertThat(controller.groups(false)).extracting(GroupRecord::name).containsExactly("Новый номер");
        assertThat(groups.activeJids()).containsExactly("3@g.us");
        assertThat(groups.isSendable("1@g.us")).isFalse();
        // История помнит названия для отчётов.
        assertThat(groups.findAll()).hasSize(3);

        gateway.replaceGroups(List.of(new GroupInfo("1@g.us", "Старый номер 1", true, true, true),
                new GroupInfo("3@g.us", "Новый номер", true, true, true)));
        groupSync.sync();
        assertThat(controller.groups(true)).extracting(GroupRecord::jid).containsExactlyInAnyOrder("1@g.us", "3@g.us");
    }
}
