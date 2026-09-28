package kz.wasender.dispatch;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RestartRecoveryTest extends IntegrationTest {

    @Test
    void deliveryInterruptedMidSendIsTreatedAsSentAndNotRepeated() throws Exception {
        useGroups(12);
        addValidRow("Рестарт посреди рассылки");
        poller.poll();
        var id = requests.findAll().getFirst().id();
        while (gateway.sent().size() < 5) {
            dispatcher.cycle();
        }
        var sentBeforeCrash = sentJids();
        var interrupted = deliveries.nextPending(id).orElseThrow();
        deliveries.updateStatus(interrupted.id(), DeliveryStatus.SENDING, null, Instant.now(clock));

        var recovered = dispatcher.recoverInterrupted();
        runUntilBlocked(500);

        assertThat(recovered).isEqualTo(1);
        var all = sentJids();
        assertThat(all).hasSize(11).doesNotHaveDuplicates().startsWith(sentBeforeCrash.toArray(String[]::new));
        assertThat(all).doesNotContain(interrupted.groupJid());
        var statuses = deliveries.findByRequest(id).stream().map(DeliveryRecord::status).toList();
        assertThat(statuses).hasSize(12).allMatch(status -> status == DeliveryStatus.SENT);
        assertThat(deliveries.progress(id).sheetText()).isEqualTo("12 / 12");
    }

    @Test
    void secondPollAfterRestartDoesNotRequeueKnownRequest() throws Exception {
        useGroups(3);
        addValidRow("Одна заявка");
        poller.poll();
        runUntilBlocked(100);
        assertThat(sentJids()).hasSize(3);

        dispatcher.recoverInterrupted();
        assertThat(poller.poll()).isZero();
        runUntilBlocked(100);

        assertThat(requests.findAll()).hasSize(1);
        assertThat(sentJids()).hasSize(3);
    }
}
