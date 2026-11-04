package kz.wasender.settings;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GroupPauseSettingTest extends IntegrationTest {
    @Autowired
    SettingsService settings;

    private static SettingsService.View pause(Double min, Double max) {
        return new SettingsService.View(null, null, null, null, null, null, min, max, null, null, null, null, null,
                null, null, null, null, null);
    }

    @Test
    void groupPauseTakesFractionsOfASecond() {
        var view = settings.update(pause(1.5, 2.5));

        assertThat(view.groupPauseMinSeconds()).isEqualTo(1.5);
        assertThat(view.groupPauseMaxSeconds()).isEqualTo(2.5);
        assertThat(settings.dispatch().groupPauseMin()).isEqualTo(Duration.ofMillis(1500));
        assertThat(settings.dispatch().groupPauseMax()).isEqualTo(Duration.ofMillis(2500));
    }

    @Test
    void negativeOrInvertedPauseIsRejected() {
        assertThatThrownBy(() -> settings.update(pause(-0.5, 2.0))).isInstanceOf(SettingsService.InvalidSettingException.class);
        assertThatThrownBy(() -> settings.update(pause(2.5, 1.5))).isInstanceOf(SettingsService.InvalidSettingException.class);
    }
}
