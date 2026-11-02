package kz.wasender.group;

import kz.wasender.support.ApiTest;
import kz.wasender.whatsapp.GroupInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class GroupBlockReasonTest extends ApiTest {
    @Autowired
    GroupRepository groups;

    @Test
    void everyGroupOutsideTheMailingTellsWhy() throws Exception {
        gateway.replaceGroups(List.of(
                new GroupInfo("1@g.us", "В рассылке", true, true, true),
                new GroupInfo("2@g.us", "ТЕНТ ХОРГОС - и другие страны", false, true, true),
                new GroupInfo("3@g.us", "Только админы", true, true, false),
                new GroupInfo("4@g.us", "Номер вышел", true, false, false),
                new GroupInfo("5@g.us", "Сообщество", true, true, true, null, true),
                new GroupInfo("6@g.us", "Ошибка отправки", true, true, true)));
        groupSync.sync();
        groups.deactivate("6@g.us", clock.instant());

        var result = perform(get("/api/groups"), admin());

        assertThat(blockedBy(result, "1@g.us")).isNull();
        assertThat(blockedBy(result, "2@g.us")).isEqualTo(GroupBlock.NOT_ARCHIVED.name());
        assertThat(blockedBy(result, "3@g.us")).isEqualTo(GroupBlock.ADMINS_ONLY.name());
        assertThat(blockedBy(result, "4@g.us")).isEqualTo(GroupBlock.NOT_MEMBER.name());
        assertThat(blockedBy(result, "5@g.us")).isEqualTo(GroupBlock.COMMUNITY.name());
        assertThat(blockedBy(result, "6@g.us")).isEqualTo(GroupBlock.SEND_FAILED.name());
    }

    private static Object blockedBy(MvcResult result, String jid) throws Exception {
        List<Object> values = read(result, "$[?(@.jid == '" + jid + "')].blockedBy");
        assertThat(values).hasSize(1);
        return values.getFirst();
    }
}
