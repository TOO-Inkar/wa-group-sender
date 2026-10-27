package kz.wasender.campaign;

import kz.wasender.config.CampaignProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Random;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class StartJitterTest {
    private static final ZonedDateTime FIVE_PM = ZonedDateTime.of(2026, 10, 27, 17, 0, 0, 0, ZoneId.of("Asia/Almaty"));

    @Test
    void scheduledStartMovesARandomFewMinutesLater() {
        var jitter = new StartJitter(new CampaignProperties(Duration.ofMinutes(1), Duration.ofMinutes(5)), new Random(7));

        var starts = IntStream.range(0, 50).mapToObj(i -> Duration.between(FIVE_PM.toInstant(), jitter.startAt(FIVE_PM))).toList();

        assertThat(starts).allSatisfy(d -> assertThat(d).isBetween(Duration.ofMinutes(1), Duration.ofMinutes(5)));
        assertThat(starts.stream().distinct()).hasSizeGreaterThan(40);
    }

    @Test
    void noOccurrenceStaysEmpty() {
        var jitter = new StartJitter(new CampaignProperties(Duration.ofMinutes(1), Duration.ofMinutes(5)), new Random(7));
        assertThat(jitter.startAt(null)).isNull();
    }
}
