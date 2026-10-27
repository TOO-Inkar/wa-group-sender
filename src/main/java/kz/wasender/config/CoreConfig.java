package kz.wasender.config;

import kz.wasender.time.Sleeper;
import kz.wasender.time.ThreadSleeper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.random.RandomGenerator;

@Configuration(proxyBeanMethods = false)
public class CoreConfig {
    @Bean
    Clock clock(AppProperties properties) {
        return Clock.system(properties.zone());
    }

    @Bean
    RandomGenerator randomGenerator() {
        return new SecureRandom();
    }

    @Bean
    Sleeper sleeper() {
        return new ThreadSleeper();
    }
}
