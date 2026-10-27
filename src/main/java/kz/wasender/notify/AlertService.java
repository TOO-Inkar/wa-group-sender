package kz.wasender.notify;

import kz.wasender.config.NotifyProperties;
import kz.wasender.engine.TenantInfo;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AlertService {
    private static final Logger log = LoggerFactory.getLogger(AlertService.class);

    private final NotifyProperties properties;
    private final List<Notifier> notifiers;
    private final Clock clock;
    private final TenantInfo tenant;
    private final TenantRepository tenants;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    public AlertService(NotifyProperties properties, List<Notifier> notifiers, Clock clock, TenantInfo tenant, TenantRepository tenants) {
        this.properties = properties;
        this.notifiers = notifiers;
        this.clock = clock;
        this.tenant = tenant;
        this.tenants = tenants;
    }

    public int alert(String key, String text) {
        var now = Instant.now(clock);
        var previous = lastSent.get(key);
        if (previous != null && previous.plus(properties.cooldown()).isAfter(now)) {
            log.info("ALERT suppressed by cooldown key={}", key);
            return 0;
        }
        lastSent.put(key, now);
        log.warn("ALERT key={} text={}", key, text);
        var message = "[wa-group-sender] " + tenantName() + ": " + text;
        var delivered = 0;
        for (var notifier : notifiers) {
            if (!notifier.configured()) {
                log.warn("ALERT channel {} is not configured, check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS in .env", notifier.name());
                continue;
            }
            delivered += notifier.send(message);
        }
        return delivered;
    }

    private String tenantName() {
        return tenants.find(tenant.id()).map(Tenant::name).orElse(tenant.name());
    }
}
