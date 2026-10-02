package kz.wasender.web;

import kz.wasender.request.RequestStatus;
import kz.wasender.support.IntegrationTest;
import kz.wasender.whatsapp.GroupInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AdminRequestsTest extends IntegrationTest {

    @Autowired
    AdminController admin;

    @Test
    void requestsCarryDeliveryProgress() throws Exception {
        useGroups(3);
        addValidRow("АЛМАТЫ → АСТАНА");
        poller.poll();
        runUntilBlocked(500);

        var views = admin.requests();

        assertThat(views).hasSize(1);
        var view = views.getFirst();
        assertThat(view.status()).isEqualTo(RequestStatus.DONE);
        assertThat(view.progress().total()).isEqualTo(3);
        assertThat(view.progress().sent()).isEqualTo(3);
        assertThat(view.message()).contains("АЛМАТЫ → АСТАНА");
    }

    @Test
    void requestFromAdminPageGoesToEveryActiveGroup() throws Exception {
        useGroups(4);

        var response = admin.createRequest(new AdminController.NewRequest(
                "ХОРГОС → БАКУ", "Срочно", "Тент 20 т\nРеф 22 т", "Мука", "450 000 ₸", null, null));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        var created = (AdminController.RequestView) response.getBody();
        assertThat(created.status()).isEqualTo(RequestStatus.QUEUED);
        assertThat(created.sheetRow()).isNull();
        assertThat(admin.previewRequest(new AdminController.NewRequest(
                "ХОРГОС → БАКУ", "Срочно", "Тент 20 т\nРеф 22 т", "Мука", "450 000 ₸", null, null)).getBody())
                .startsWith("📍*ХОРГОС → БАКУ*");

        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(4).doesNotHaveDuplicates();
        assertThat(gateway.sent()).allMatch(message -> message.text().equals(created.message()));
        assertThat(requests.find(created.id()).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void requestWithoutRequiredFieldsIsRejected() {
        var response = admin.createRequest(new AdminController.NewRequest("ХОРГОС → БАКУ", " ", null, "Мука", "🔥", null, null));

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().toString()).contains("Дата / срочность").contains("Машины и тоннаж");
        assertThat(requests.findAll()).isEmpty();
    }

    @Test
    void requestWithChosenGroupsGoesOnlyToThemEvenWhenNotArchived() throws Exception {
        var test = "120363999999999@g.us";
        gateway.replaceGroups(List.of(
                new GroupInfo("120363000000001@g.us", "Архив 1", true, true, true),
                new GroupInfo("120363000000002@g.us", "Архив 2", true, true, true),
                new GroupInfo(test, "Тестовая", false, true, true)));
        groupSync.sync();

        var response = admin.createRequest(new AdminController.NewRequest(
                "АЛМАТЫ → АСТАНА", "Завтра", "Тент 20 т", "Мука", "🔥", null, List.of(test)));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(((AdminController.RequestView) response.getBody()).targetGroups()).isEqualTo(1);

        runUntilBlocked(500);

        assertThat(sentJids()).containsExactly(test);
        assertThat(admin.deliveries("1")).singleElement().satisfies(delivery -> {
            assertThat(delivery.groupName()).isEqualTo("Тестовая");
            assertThat(delivery.status()).isEqualTo(kz.wasender.dispatch.DeliveryStatus.SENT);
        });
        assertThat(admin.schedule()).containsKeys("windowStart", "windowEnd", "weekendsEnabled");
        assertThat(admin.requests().getFirst().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void requestForGroupTheNumberCannotWriteToIsRejected() {
        gateway.replaceGroups(List.of(new GroupInfo("120363000000001@g.us", "Только админы", true, true, false)));
        groupSync.sync();

        var response = admin.createRequest(new AdminController.NewRequest(
                "АЛМАТЫ → АСТАНА", "Завтра", "Тент 20 т", "Мука", "🔥", null, List.of("120363000000001@g.us", "unknown@g.us")));

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().toString()).contains("120363000000001@g.us").contains("unknown@g.us");
        assertThat(requests.findAll()).isEmpty();
    }

    @Test
    void groupListsAreSavedReplacedByNameAndDeleted() {
        var saved = (kz.wasender.group.GroupListRepository.GroupList) admin.saveGroupList(
                new AdminController.GroupListRequest("Тест", List.of("2@g.us", "1@g.us", "1@g.us"))).getBody();
        assertThat(saved.groups()).containsExactly("1@g.us", "2@g.us");

        admin.saveGroupList(new AdminController.GroupListRequest(" Тест ", List.of("3@g.us")));
        assertThat(admin.groupLists()).singleElement().satisfies(list -> assertThat(list.groups()).containsExactly("3@g.us"));

        assertThat(admin.deleteGroupList(saved.id()).getStatusCode().value()).isEqualTo(204);
        assertThat(admin.groupLists()).isEmpty();
        assertThat(admin.saveGroupList(new AdminController.GroupListRequest("", List.of("1@g.us"))).getStatusCode().value()).isEqualTo(400);
    }
}
