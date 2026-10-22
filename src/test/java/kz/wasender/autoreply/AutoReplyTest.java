package kz.wasender.autoreply;

import kz.wasender.settings.SettingsService;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class AutoReplyTest extends IntegrationTest {
    @Autowired
    SettingsService settings;

    @Test
    void directMessageGetsOneReplyPerCooldown() {
        gateway.simulateDirectMessage("77001112233@s.whatsapp.net", "Иван");
        await().atMost(Duration.ofSeconds(5)).until(() -> gateway.direct().size() == 1);
        assertThat(gateway.direct().getFirst().text()).isEqualTo(SettingsService.DEFAULT_AUTOREPLY_TEXT);

        gateway.simulateDirectMessage("77001112233@s.whatsapp.net", "Иван");
        clock.advance(Duration.ofHours(1));
        gateway.simulateDirectMessage("77001112233@s.whatsapp.net", "Иван");
        await().during(Duration.ofMillis(300)).atMost(Duration.ofSeconds(2)).until(() -> gateway.direct().size() == 1);

        clock.advance(Duration.ofHours(12));
        gateway.simulateDirectMessage("77001112233@s.whatsapp.net", "Иван");
        await().atMost(Duration.ofSeconds(5)).until(() -> gateway.direct().size() == 2);
    }

    @Test
    void callIsRejectedAndAnsweredWithTheTextFromSettings() {
        settings.update(new SettingsService.View(null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, "Это бот, звонить не нужно.", null));

        gateway.simulateCall("77005556677@s.whatsapp.net", "CALL1");

        await().atMost(Duration.ofSeconds(5)).until(() -> gateway.direct().size() == 1);
        assertThat(gateway.rejectedCalls()).containsExactly("CALL1");
        assertThat(gateway.direct().getFirst().text()).isEqualTo("Это бот, звонить не нужно.");
    }

    @Test
    void disabledAutoReplyStaysSilent() {
        settings.update(new SettingsService.View(null, null, null, null, null, null, null, null, null, null, null, null,
                false, false, null, null, null));

        gateway.simulateDirectMessage("77001112233@s.whatsapp.net", "Иван");
        gateway.simulateCall("77005556677@s.whatsapp.net", "CALL2");

        await().during(Duration.ofMillis(300)).atMost(Duration.ofSeconds(2)).until(() -> gateway.direct().isEmpty());
        assertThat(gateway.rejectedCalls()).isEmpty();
    }
}
