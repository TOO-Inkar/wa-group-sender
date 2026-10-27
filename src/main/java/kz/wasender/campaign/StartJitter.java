package kz.wasender.campaign;

import kz.wasender.config.CampaignProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.random.RandomGenerator;

@Component
public class StartJitter {
    private final CampaignProperties properties;
    private final RandomGenerator random;

    public StartJitter(CampaignProperties properties, RandomGenerator random) {
        this.properties = properties;
        this.random = random;
    }

    public Instant startAt(ZonedDateTime occurrence) {
        if (occurrence == null) {
            return null;
        }
        var min = properties.startJitterMin().toMillis();
        var max = Math.max(min, properties.startJitterMax().toMillis());
        return occurrence.toInstant().plus(Duration.ofMillis(random.nextLong(min, max + 1)));
    }
}
