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
        var byRequest = gateway.sent().stream().collect(java.util.stream.Collectors.groupingBy(
                message -> message.text().lines().findFirst().orElseThrow(), java.util.LinkedHashMap::new,
                java.util.stream.Collectors.mapping(kz.wasender.whatsapp.fake.FakeWhatsAppGateway.SentMessage::groupJid,
                        java.util.stream.Collectors.toList())));
        assertThat(byRequest.get("📍*Первая*")).isEqualTo(orders.get(0));
        assertThat(byRequest.get("📍*Вторая*")).isEqualTo(orders.get(1));
        assertThat(byRequest.get("📍*Третья*")).isEqualTo(orders.get(2));
    }
}
