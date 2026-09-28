package kz.wasender.web;

import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.group.GroupSyncService;
import kz.wasender.notify.AlertService;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.template.PreviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final MediaType TEXT_UTF8 = new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8);

    private final Dispatcher dispatcher;
    private final RiskMonitor risk;
    private final GroupSyncService groupSync;
    private final AlertService alerts;
    private final RequestRepository requests;
    private final PreviewService preview;
    private final DeliveryRepository deliveries;

    public AdminController(Dispatcher dispatcher, RiskMonitor risk, GroupSyncService groupSync, AlertService alerts,
                           RequestRepository requests, PreviewService preview, DeliveryRepository deliveries) {
        this.dispatcher = dispatcher;
        this.risk = risk;
        this.groupSync = groupSync;
        this.alerts = alerts;
        this.requests = requests;
        this.preview = preview;
        this.deliveries = deliveries;
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
        return Map.of("deliveredChats", delivered);
    }

    @PostMapping("/preview")
    public ResponseEntity<?> preview(@RequestBody PreviewRequest request) {
        if (request.id() != null && !request.id().isBlank()) {
            return preview.byId(request.id())
                    .<ResponseEntity<?>>map(text -> ResponseEntity.ok().contentType(TEXT_UTF8).body(text))
                    .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "row with ID " + request.id() + " not found")));
        }
        if (request.fields() != null && !request.fields().isEmpty()) {
            return ResponseEntity.ok().contentType(TEXT_UTF8).body(preview.byFields(request.fields()));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "pass \"id\" or \"fields\""));
    }

    @GetMapping("/requests")
    public List<RequestView> requests() {
        return requests.findAll().stream().map(request -> RequestView.of(request, deliveries.progress(request.id()))).toList();
    }

    public record PreviewRequest(String id, Map<String, String> fields) {
    }

    public record RequestView(String id, Integer sheetRow, String message, RequestStatus status, String error,
                              Instant queuedAt, Instant startedAt, Instant completedAt, DeliveryRepository.Progress progress) {

        static RequestView of(RequestRecord request, DeliveryRepository.Progress progress) {
            return new RequestView(request.id(), request.sheetRow(), request.message(), request.status(), request.error(),
                    request.queuedAt(), request.startedAt(), request.completedAt(), progress);
        }
    }
}
