package kz.wasender.engine;

import kz.wasender.config.AppProperties;
import kz.wasender.notify.TelegramBot;
import kz.wasender.platform.InviteCodes;
import kz.wasender.platform.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

@Component
public class TenancyStartup {
    public static final String LEGACY_TENANT_NAME = "Кабинет 1";
    private static final Logger log = LoggerFactory.getLogger(TenancyStartup.class);

    private final TenantRepository tenants;
    private final TenantEngines engines;
    private final TelegramBot telegramBot;
    private final AppProperties app;
    private final Clock clock;

    public TenancyStartup(TenantRepository tenants, TenantEngines engines, TelegramBot telegramBot, AppProperties app, Clock clock) {
        this.tenants = tenants;
        this.engines = engines;
        this.telegramBot = telegramBot;
        this.app = app;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        bootstrap();
        for (var tenant : tenants.findActive()) {
            try {
                engines.start(tenant);
            } catch (RuntimeException e) {
                log.error("ENGINE start failed tenant={}", tenant.key(), e);
            }
        }
        if (app.schedulingEnabled()) {
            telegramBot.start();
        }
    }

    private void bootstrap() {
        if (tenants.findAll().isEmpty()) {
            var tenant = tenants.create(LEGACY_TENANT_NAME, true, InviteCodes.random(), Instant.now(clock));
            log.info("TENANT bootstrap created legacy tenant id={} name=\"{}\"", tenant.id(), tenant.name());
        }
    }
}
