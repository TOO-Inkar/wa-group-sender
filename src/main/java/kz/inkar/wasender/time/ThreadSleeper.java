package kz.inkar.wasender.time;

import java.time.Duration;

public class ThreadSleeper implements Sleeper {

    @Override
    public void sleep(Duration duration) throws InterruptedException {
        if (duration.isPositive()) {
            Thread.sleep(duration);
        }
    }
}
