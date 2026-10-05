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

    @Test
    void severalRequestsGoAsOneNumberedMessageWithTheContactOnce() throws Exception {
        useGroups(2);
        var items = List.of(
                new AdminController.Item("КАЛЖАТ → БАКУ", "Срочно", "120 м³ / 5 осей — ⚖️ до 23 т", "Хозтовары", "🔥🔥", "⛴️ Через паром"),
                new AdminController.Item("ХОРГОС → БАКУ", "Срочно, груз готов", "120 м³/5 осей", "Хозтовары", "🔥🔥", null));
        var request = new AdminController.NewRequest(null, null, null, null, null, null, null, items, null, "+7 702 416 69 51 (Ернар)");

        var created = (AdminController.RequestView) admin.createRequest(request).getBody();

        var text = created.message();
        assertThat(text).startsWith("1️⃣ 📍*КАЛЖАТ → БАКУ*");
        assertThat(text).contains("\n\n━━━━━━━━━━━━━━━━━━━━\n\n2️⃣ 📍*ХОРГОС → БАКУ*");
        assertThat(text).endsWith("📞 *+7 702 416 69 51 (Ернар)*");
        assertThat(text.split("📞", -1)).hasSize(2);
        assertThat(text).contains("⛴️ Через паром");
        runUntilBlocked(500);
        assertThat(gateway.sent()).hasSize(2).allMatch(message -> message.text().equals(text));
    }

    @Test
    void readyTextIsSentAsIs() throws Exception {
        useGroups(1);
        var text = "1️⃣ 📍*ХОРГОС → МОСКВА*\n\n📐 130 м³ / 6 осей\n\n📞 *+7 702 416 69 51*";

        var created = (AdminController.RequestView) admin.createRequest(
                new AdminController.NewRequest(null, null, null, null, null, null, null, null, "\n" + text + "\n", null)).getBody();

        assertThat(created.message()).isEqualTo(text);
        runUntilBlocked(500);
        assertThat(gateway.sent()).singleElement().satisfies(message -> assertThat(message.text()).isEqualTo(text));
    }

    @Test
    void incompleteItemIsReportedByNumber() {
        var items = List.of(
                new AdminController.Item("КАЛЖАТ → БАКУ", "Срочно", "Тент", "Мука", "🔥", null),
                new AdminController.Item("ХОРГОС → БАКУ", "", "Тент", "Мука", "", null),
                new AdminController.Item(null, null, null, null, null, null));

        var response = admin.createRequest(new AdminController.NewRequest(null, null, null, null, null, null, null, items, null, null));

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().toString()).contains("заявка 2").contains("Дата / срочность").contains("Фрахт")
                .doesNotContain("заявка 3");
    }

    @Test
    void rejectedGroupIsRetriedAfterTheOthersAndDoesNotCountAsRisk() throws Exception {
        useGroups(3);
        var rejected = "12036399000002@g.us";
        gateway.rejectFor(rejected, 1);

        admin.createRequest(new AdminController.NewRequest("АЛМАТЫ → АСТАНА", "Завтра", "Тент 20 т", "Мука", "🔥", null, null));
        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(3).doesNotHaveDuplicates().contains(rejected);
        assertThat(admin.requests().getFirst().progress().failed()).isZero();
        assertThat(risk.eventsInWindow()).isZero();
    }

    @Test
    void failedGroupsCanBeRetriedAfterTheRequestFinished() throws Exception {
        useGroups(3);
        var broken = "12036399000001@g.us";
        gateway.failFor(broken);
        admin.createRequest(new AdminController.NewRequest("АЛМАТЫ → АСТАНА", "Завтра", "Тент 20 т", "Мука", "🔥", null, null));
        runUntilBlocked(500);
        assertThat(admin.requests().getFirst().progress().failed()).isEqualTo(1);

        gateway.stopFailing(broken);
        var retried = admin.retryFailed("1");
        assertThat(retried.getStatusCode().value()).isEqualTo(200);
        runUntilBlocked(500);

        var request = admin.requests().getFirst();
        assertThat(request.status()).isEqualTo(RequestStatus.DONE);
        assertThat(request.progress().sent()).isEqualTo(3);
        assertThat(request.progress().failed()).isZero();
        assertThat(sentJids()).hasSize(3).doesNotHaveDuplicates();
        assertThat(admin.retryFailed("1").getStatusCode().value()).isEqualTo(409);
    }
}
