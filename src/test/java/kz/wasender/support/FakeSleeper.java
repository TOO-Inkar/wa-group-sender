package kz.wasender.support;

import kz.wasender.time.Sleeper;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class FakeSleeper implements Sleeper {

    private final MutableClock clock;
    private final List<Duration> sleeps = new CopyOnWriteArrayList<>();

    public FakeSleeper(MutableClock clock) {
        this.clock = clock;
    }

    @Override
    public void sleep(Duration duration) {
        sleeps.add(duration);
        clock.advance(duration);
    }

    public List<Duration> sleeps() {
        return List.copyOf(sleeps);
    }

    public void clear() {
        sleeps.clear();
    }
}
