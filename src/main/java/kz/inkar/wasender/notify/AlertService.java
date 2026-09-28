package kz.inkar.wasender.notify;

import kz.inkar.wasender.config.NotifyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);

    private final NotifyProperties properties;
    private final List<Notifier> notifiers;
    private final Clock clock;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    public AlertService(NotifyProperties properties, List<Notifier> notifiers, Clock clock) {
        this.properties = properties;
        this.notifiers = notifiers;
        this.clock = clock;
    }

    public boolean alert(String key, String text) {
        var now = Instant.now(clock);
        var previous = lastSent.get(key);
        if (previous != null && previous.plus(properties.cooldown()).isAfter(now)) {
            log.info("ALERT suppressed by cooldown key={}", key);
            return false;
        }
        lastSent.put(key, now);
        log.warn("ALERT key={} text={}", key, text);
        var delivered = false;
        for (var notifier : selected()) {
            if (!notifier.configured()) {
                log.warn("ALERT channel {} is not configured, check .env", notifier.channel());
                continue;
            }
            try {
                notifier.send("[wa-group-sender] " + text);
                delivered = true;
            } catch (Exception e) {
                log.error("ALERT channel {} failed: {}", notifier.channel(), e.toString());
            }
        }
        return delivered;
    }

    private List<Notifier> selected() {
        var channels = Arrays.stream(properties.channel().toLowerCase(Locale.ROOT).split("\\s*,\\s*")).toList();
        return notifiers.stream().filter(notifier -> channels.contains(notifier.channel())).toList();
    }
}
