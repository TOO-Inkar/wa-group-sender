package kz.wasender.sheets;

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import kz.wasender.config.SheetsProperties;
import kz.wasender.time.Sleeper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.Callable;

@Component
public class SheetsRetry {

    private static final Logger log = LoggerFactory.getLogger(SheetsRetry.class);

    private final SheetsProperties.Retry properties;
    private final Sleeper sleeper;

    public SheetsRetry(SheetsProperties properties, Sleeper sleeper) {
        this.properties = properties.retry();
        this.sleeper = sleeper;
    }

    public <T> T call(String operation, Callable<T> action) {
        var backoff = properties.initialBackoff();
        for (var attempt = 1; ; attempt++) {
            try {
                return action.call();
            } catch (Exception e) {
                if (!retryable(e) || attempt >= properties.maxAttempts()) {
                    throw new SheetsException(operation + " failed after " + attempt + " attempts: " + e.getMessage(), e);
                }
                log.warn("SHEETS {} attempt {}/{} failed: {}, retry in {}", operation, attempt, properties.maxAttempts(), e.getMessage(), backoff);
                try {
                    sleeper.sleep(backoff);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new SheetsException(operation + " interrupted", interrupted);
                }
                backoff = min(backoff.multipliedBy(2), properties.maxBackoff());
            }
        }
    }

    private static boolean retryable(Exception e) {
        if (e instanceof GoogleJsonResponseException response) {
            var code = response.getStatusCode();
            return code == 408 || code == 429 || code >= 500;
        }
        return e instanceof IOException;
    }

    private static Duration min(Duration a, Duration b) {
        return a.compareTo(b) <= 0 ? a : b;
    }
}
