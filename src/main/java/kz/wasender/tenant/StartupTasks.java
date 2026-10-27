package kz.wasender.tenant;

import kz.wasender.campaign.CampaignService;
import kz.wasender.config.AppProperties;
import kz.wasender.config.DispatchProperties;
import kz.wasender.config.GroupsProperties;
import kz.wasender.config.SheetsProperties;
import kz.wasender.config.WatchdogProperties;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.engine.TenantInfo;
import kz.wasender.group.GroupSyncService;
import kz.wasender.sheets.SheetPoller;
import kz.wasender.sheets.SheetUpdateBuffer;
import kz.wasender.whatsapp.SessionWatchdog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;

import java.time.Duration;

public class StartupTasks {
    private static final Logger log = LoggerFactory.getLogger(StartupTasks.class);
    private static final Duration CAMPAIGN_TICK = Duration.ofSeconds(30);

    private final TenantInfo tenant;
    private final AppProperties app;
    private final SheetsProperties sheets;
    private final GroupsProperties groups;
    private final WatchdogProperties watchdog;
    private final DispatchProperties dispatch;
    private final TaskScheduler scheduler;
    private final SessionWatchdog sessionWatchdog;
    private final SheetPoller poller;
    private final SheetUpdateBuffer buffer;
    private final GroupSyncService groupSync;
    private final Dispatcher dispatcher;
    private final CampaignService campaigns;

    public StartupTasks(TenantInfo tenant, AppProperties app, SheetsProperties sheets, GroupsProperties groups,
                        WatchdogProperties watchdog, DispatchProperties dispatch, TaskScheduler scheduler,
                        SessionWatchdog sessionWatchdog, SheetPoller poller, SheetUpdateBuffer buffer, GroupSyncService groupSync,
                        Dispatcher dispatcher, CampaignService campaigns) {
        this.tenant = tenant;
        this.app = app;
        this.sheets = sheets;
        this.groups = groups;
        this.watchdog = watchdog;
        this.dispatch = dispatch;
        this.scheduler = scheduler;
        this.sessionWatchdog = sessionWatchdog;
        this.poller = poller;
        this.buffer = buffer;
        this.groupSync = groupSync;
        this.dispatcher = dispatcher;
        this.campaigns = campaigns;
    }

    public void start() {
        if (!app.schedulingEnabled()) {
            log.info("Background tasks disabled (app.scheduling-enabled=false) tenant={}", tenant.key());
            return;
        }
        log.info("Starting background tasks tenant={} zone={}", tenant.key(), app.zone());
        scheduler.schedule(sessionWatchdog::start, scheduler.getClock().instant());
        repeat(sessionWatchdog::check, watchdog.checkInterval());
        if (sheets.enabled() && tenant.legacy()) {
            scheduler.schedule(poller::checkLayout, scheduler.getClock().instant());
            repeat(poller::poll, sheets.pollInterval());
        } else {
            log.warn("Google Sheets polling disabled tenant={}", tenant.key());
        }
        repeat(buffer::flushQuietly, sheets.progressFlushInterval());
        repeat(groupSync::syncQuietly, groups.syncInterval());
        repeat(campaigns::tickQuietly, CAMPAIGN_TICK);
        if (dispatch.autostart()) {
            dispatcher.start();
        }
    }

    private void repeat(Runnable task, Duration interval) {
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                log.error("Background task failed", e);
            }
        }, scheduler.getClock().instant().plus(interval), interval);
    }
}
