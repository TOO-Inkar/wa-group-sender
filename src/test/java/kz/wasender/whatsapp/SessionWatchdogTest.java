package kz.wasender.whatsapp;

import kz.wasender.config.WatchdogProperties;
import kz.wasender.notify.AlertService;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.risk.RiskType;
import kz.wasender.support.MutableClock;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class SessionWatchdogTest {

    private final MutableClock clock = new MutableClock(LocalDateTime.of(2026, 9, 28, 10, 0));
    private final AlertService alerts = mock(AlertService.class);
    private final RiskMonitor risk = mock(RiskMonitor.class);
    private final FailingGateway gateway = new FailingGateway();
    private final WatchdogProperties properties = new WatchdogProperties(Duration.ofSeconds(15), 4,
            Duration.ofSeconds(10), Duration.ofMinutes(1), Duration.ofMinutes(3));
    private final SessionWatchdog watchdog = new SessionWatchdog(gateway, properties, alerts, risk, clock);

    @Test
    void backoffGrowsExponentiallyUpToMaximum() {
        assertThat(List.of(0, 1, 2, 3, 4, 10).stream().map(watchdog::delayFor).toList()).containsExactly(
                Duration.ofSeconds(10), Duration.ofSeconds(20), Duration.ofSeconds(40), Duration.ofMinutes(1),
                Duration.ofMinutes(1), Duration.ofMinutes(1));
    }

    @Test
    void reconnectsWithBackoffAndAlertsAfterMaxAttempts() {
        watchdog.start();
        assertThat(gateway.connects).isEqualTo(1);

        for (var i = 0; i < 6; i++) {
            var next = watchdog.nextAttemptAt();
            assertThat(next).isNotNull();
            clock.advance(Duration.between(clock.instant(), next).minusSeconds(1));
            watchdog.check();
            assertThat(gateway.connects).isEqualTo(i + 1);
            clock.advance(Duration.ofSeconds(1));
            watchdog.check();
            assertThat(gateway.connects).isEqualTo(i + 2);
        }

        verify(alerts, times(1)).alert(eq("reconnect-exhausted"), anyString());
        verify(risk, times(7)).record(eq(RiskType.DISCONNECTED), any(), any(), anyString());
    }

    @Test
    void successfulReconnectResetsAttempts() {
        watchdog.start();
        clock.advance(Duration.ofSeconds(10));
        gateway.succeed = true;
        watchdog.check();

        assertThat(gateway.sessionState()).isEqualTo(SessionState.CONNECTED);
        assertThat(watchdog.attempts()).isZero();
        assertThat(watchdog.nextAttemptAt()).isNull();
        verify(alerts, never()).alert(eq("reconnect-exhausted"), anyString());
    }

    @Test
    void logoutAlertsAndWaitsForQrWithoutCountingAttempts() {
        gateway.succeed = true;
        watchdog.start();

        gateway.logout();
        clock.advance(Duration.ofSeconds(10));
        watchdog.check();

        verify(alerts).alert(eq("logged-out"), anyString());
        assertThat(watchdog.attempts()).isZero();
        assertThat(gateway.connects).isEqualTo(2);
    }

    static class FailingGateway extends AbstractWhatsAppGateway {

        int connects;
        boolean succeed;

        @Override
        public void connect() {
            connects++;
            updateState(SessionState.CONNECTING);
            if (succeed) {
                publish(new GatewayEvent.Connected());
            } else {
                publish(new GatewayEvent.Disconnected("network down", false));
            }
        }

        void logout() {
            publish(new GatewayEvent.LoggedOut());
        }

        @Override
        public void disconnect() {
        }

        @Override
        public List<GroupInfo> listGroups() {
            return List.of();
        }

        @Override
        public void sendText(String groupJid, String text) {
        }

        @Override
        public void sendTyping(String groupJid, boolean typing) {
        }
    }
}
