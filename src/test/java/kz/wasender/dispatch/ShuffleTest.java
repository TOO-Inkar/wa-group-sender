package kz.wasender.dispatch;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ShuffleTest extends IntegrationTest {
    @Test
    void groupOrderChangesFromRequestToRequest() throws Exception {
        useGroups(20);
        addValidRow("Первая");
        addValidRow("Вторая");
        addValidRow("Третья");
        poller.poll();

        runUntilBlocked(1000);

        var all = requests.findAll();
        assertThat(all).hasSize(3);
        var orders = all.stream()
                .map(request -> deliveries.findByRequest(request.id()).stream().map(DeliveryRecord::groupJid).toList())
                .toList();
        assertThat(orders).allSatisfy(order -> assertThat(order).hasSize(20).doesNotHaveDuplicates()
                .containsExactlyInAnyOrderElementsOf(orders.getFirst()));
        assertThat(orders.get(0)).isNotEqualTo(orders.get(1));
        assertThat(orders.get(1)).isNotEqualTo(orders.get(2));
        assertThat(orders.get(0)).isNotEqualTo(orders.get(2));
        assertThat(sentJids()).hasSize(20).doesNotHaveDuplicates();
        assertThat(gateway.sent()).allSatisfy(message -> assertThat(message.text()).contains("Первая", "Вторая", "Третья"));
    }
}
