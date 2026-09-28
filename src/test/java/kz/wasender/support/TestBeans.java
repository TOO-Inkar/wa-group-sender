package kz.wasender.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.random.RandomGenerator;

@TestConfiguration(proxyBeanMethods = false)
public class TestBeans {

    public static final LocalDateTime MONDAY_10 = LocalDateTime.of(2026, 9, 28, 10, 0);

    @Bean
    @Primary
    MutableClock mutableClock() {
        return new MutableClock(MONDAY_10);
    }

    @Bean
    @Primary
    FakeSleeper fakeSleeper(MutableClock clock) {
        return new FakeSleeper(clock);
    }

    @Bean
    @Primary
    RandomGenerator seededRandom() {
        return new Random(20260928L);
    }

    @Bean
    RecordingNotifier recordingNotifier() {
        return new RecordingNotifier();
    }
}
