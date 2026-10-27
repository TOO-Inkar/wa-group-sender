package kz.wasender.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class FailureThrottle {
    private final int maxFailures;
    private final Duration window;
    private final Clock clock;
    private final Map<String, ArrayDeque<Instant>> failures = new ConcurrentHashMap<>();

    FailureThrottle(int maxFailures, Duration window, Clock clock) {
        this.maxFailures = maxFailures;
        this.window = window;
        this.clock = clock;
    }

    boolean blocked(String key) {
        var list = failures.get(key);
        if (list == null) {
            return false;
        }
        synchronized (list) {
            var cutoff = Instant.now(clock).minus(window);
            while (!list.isEmpty() && list.peekFirst().isBefore(cutoff)) {
                list.pollFirst();
            }
            return list.size() >= maxFailures;
        }
    }

    void record(String key) {
        var list = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (list) {
            list.addLast(Instant.now(clock));
        }
    }

    void reset(String key) {
        failures.remove(key);
    }
}
