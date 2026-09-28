package kz.inkar.wasender.risk;

import kz.inkar.wasender.dispatch.DispatcherState;
import kz.inkar.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class RiskMonitorTest extends IntegrationTest {

    @Test
    void warningThresholdStretchesPauses() {
        for (var i = 0; i < 4; i++) {
            risk.record(RiskType.SEND_FAILED, "g" + i + "@g.us", "R1", "error");
        }
        assertThat(risk.pauseMultiplier()).isEqualTo(1.0);
        assertThat(notifier.anyContains("Порог предупреждения")).isFalse();

        risk.record(RiskType.GROUP_REMOVED, "g5@g.us", null, "removed");

        assertThat(risk.pauseMultiplier()).isEqualTo(2.0);
        assertThat(risk.isStopped()).isFalse();
        assertThat(notifier.anyContains("Порог предупреждения")).isTrue();
    }

    @Test
    void eventsOutsideSlidingWindowAreIgnored() {
        for (var i = 0; i < 9; i++) {
            risk.record(RiskType.SEND_FAILED, null, null, "old");
        }
        clock.advance(Duration.ofMinutes(61));

        risk.record(RiskType.SEND_FAILED, null, null, "new");

        assertThat(risk.eventsInWindow()).isEqualTo(1);
        assertThat(risk.isStopped()).isFalse();
    }

    @Test
    void criticalThresholdStopsDispatchUntilManualResume() throws Exception {
        useGroups(5);
        addValidRow("Заявка при риске");
        poller.poll();
        for (var i = 0; i < 10; i++) {
            risk.record(RiskType.SEND_FAILED, null, null, "error " + i);
        }

        assertThat(risk.isStopped()).isTrue();
        assertThat(notifier.anyContains("Рассылка ОСТАНОВЛЕНА")).isTrue();
        dispatcher.cycle();
        assertThat(dispatcher.state()).isEqualTo(DispatcherState.STOPPED_BY_RISK);
        assertThat(gateway.sent()).isEmpty();

        risk.resume();

        assertThat(risk.isStopped()).isFalse();
        assertThat(risk.eventsInWindow()).isZero();
        assertThat(risk.pauseMultiplier()).isEqualTo(1.0);
        runUntilBlocked(200);
        assertThat(sentJids()).hasSize(5);
    }

    @Test
    void sessionDropAndRemovalFromGroupAreRiskSignals() {
        useGroups(3);

        gateway.simulateRemoval("12036399000002@g.us");
        gateway.simulateDisconnect(true);

        assertThat(risk.eventsInWindow()).isEqualTo(2);
    }

    @Test
    void logoutSendsAlert() {
        gateway.simulateLogout();

        assertThat(notifier.anyContains("разлогинил")).isTrue();
    }
}
