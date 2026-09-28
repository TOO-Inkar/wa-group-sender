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
}
