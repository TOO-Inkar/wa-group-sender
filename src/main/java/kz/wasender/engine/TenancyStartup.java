package kz.wasender.engine;

import kz.wasender.config.AppProperties;
import kz.wasender.notify.TelegramBot;
import kz.wasender.platform.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class TenancyStartup {
    private static final Logger log = LoggerFactory.getLogger(TenancyStartup.class);

    private final TenantRepository tenants;
    private final TenantEngines engines;
    private final TelegramBot telegramBot;
    private final AppProperties app;

    public TenancyStartup(TenantRepository tenants, TenantEngines engines, TelegramBot telegramBot, AppProperties app) {
        this.tenants = tenants;
        this.engines = engines;
        this.telegramBot = telegramBot;
        this.app = app;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
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
}
