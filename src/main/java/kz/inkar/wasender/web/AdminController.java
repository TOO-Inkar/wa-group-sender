package kz.inkar.wasender.web;

import kz.inkar.wasender.dispatch.Dispatcher;
import kz.inkar.wasender.group.GroupSyncService;
import kz.inkar.wasender.notify.AlertService;
import kz.inkar.wasender.request.RequestRecord;
import kz.inkar.wasender.request.RequestRepository;
import kz.inkar.wasender.risk.RiskMonitor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final Dispatcher dispatcher;
    private final RiskMonitor risk;
    private final GroupSyncService groupSync;
    private final AlertService alerts;
    private final RequestRepository requests;

    public AdminController(Dispatcher dispatcher, RiskMonitor risk, GroupSyncService groupSync, AlertService alerts, RequestRepository requests) {
        this.dispatcher = dispatcher;
        this.risk = risk;
        this.groupSync = groupSync;
        this.alerts = alerts;
        this.requests = requests;
    }

    @PostMapping("/resume")
    public Map<String, Object> resume() {
        var wasStopped = risk.isStopped();
        if (wasStopped) {
            risk.resume();
        }
        var wasPaused = dispatcher.paused();
        dispatcher.unpause();
        return Map.of("resumedFromRisk", wasStopped, "resumedFromPause", wasPaused);
    }

    @PostMapping("/pause")
    public Map<String, Object> pause() {
        dispatcher.pause();
        return Map.of("paused", true);
    }

    @PostMapping("/groups/sync")
    public GroupSyncService.SyncResult syncGroups() {
        return groupSync.sync();
    }

    @PostMapping("/test-alert")
    public Map<String, Object> testAlert() {
        var delivered = alerts.alert("test-" + System.nanoTime(), "Тестовый алерт: канал уведомлений настроен.");
        return Map.of("delivered", delivered);
    }

    @GetMapping("/requests")
    public List<RequestRecord> requests() {
        return requests.findAll();
    }
}
