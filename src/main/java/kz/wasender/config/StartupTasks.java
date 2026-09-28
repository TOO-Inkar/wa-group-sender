package kz.wasender.config;

import kz.wasender.dispatch.Dispatcher;
import kz.wasender.group.GroupSyncService;
import kz.wasender.sheets.SheetPoller;
import kz.wasender.sheets.SheetUpdateBuffer;
import kz.wasender.whatsapp.SessionWatchdog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class StartupTasks {

    private static final Logger log = LoggerFactory.getLogger(StartupTasks.class);

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

    public StartupTasks(AppProperties app, SheetsProperties sheets, GroupsProperties groups, WatchdogProperties watchdog,
                        DispatchProperties dispatch, TaskScheduler scheduler, SessionWatchdog sessionWatchdog, SheetPoller poller,
                        SheetUpdateBuffer buffer, GroupSyncService groupSync, Dispatcher dispatcher) {
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
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!app.schedulingEnabled()) {
            log.info("Background tasks disabled (app.scheduling-enabled=false)");
            return;
        }
        log.info("Starting background tasks, zone={}", app.zone());
        sessionWatchdog.start();
        repeat(sessionWatchdog::check, watchdog.checkInterval());
        if (sheets.enabled()) {
            scheduler.schedule(poller::checkLayout, scheduler.getClock().instant());
            repeat(poller::poll, sheets.pollInterval());
        } else {
            log.warn("Google Sheets polling disabled (SHEETS_ENABLED=false)");
        }
        repeat(buffer::flushQuietly, sheets.progressFlushInterval());
        repeat(groupSync::syncQuietly, groups.syncInterval());
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
