package kz.wasender.web;

import kz.wasender.request.RequestStatus;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

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
                "ХОРГОС → БАКУ", "Срочно", "Тент 20 т\nРеф 22 т", "Мука", "450 000 ₸", null));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        var created = (AdminController.RequestView) response.getBody();
        assertThat(created.status()).isEqualTo(RequestStatus.QUEUED);
        assertThat(created.sheetRow()).isNull();
        assertThat(admin.previewRequest(new AdminController.NewRequest(
                "ХОРГОС → БАКУ", "Срочно", "Тент 20 т\nРеф 22 т", "Мука", "450 000 ₸", null)).getBody())
                .startsWith("📍*ХОРГОС → БАКУ*");

        runUntilBlocked(500);

        assertThat(sentJids()).hasSize(4).doesNotHaveDuplicates();
        assertThat(gateway.sent()).allMatch(message -> message.text().equals(created.message()));
        assertThat(requests.find(created.id()).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void requestWithoutRequiredFieldsIsRejected() {
        var response = admin.createRequest(new AdminController.NewRequest("ХОРГОС → БАКУ", " ", null, "Мука", "🔥", null));

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().toString()).contains("Дата / срочность").contains("Машины и тоннаж");
        assertThat(requests.findAll()).isEmpty();
    }
}
