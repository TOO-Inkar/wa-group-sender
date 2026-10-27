package kz.wasender.web;

import kz.wasender.campaign.CampaignService;
import kz.wasender.campaign.RepeatMode;
import kz.wasender.campaign.Schedule;
import kz.wasender.config.MessageProperties;
import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.dispatch.DeliveryStatus;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.group.GroupListRepository;
import kz.wasender.group.GroupRepository;
import kz.wasender.group.GroupSyncService;
import kz.wasender.notify.AlertService;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.settings.SettingsService;
import kz.wasender.sheets.SheetField;
import kz.wasender.template.PreviewService;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.EnumMap;
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
    private final RequestIntake intake;
    private final GroupListRepository groupLists;
    private final GroupRepository groups;
    private final SettingsService settings;
    private final MessageProperties message;
    private final CampaignService campaigns;

    public AdminController(Dispatcher dispatcher, RiskMonitor risk, GroupSyncService groupSync, AlertService alerts,
                           RequestRepository requests, PreviewService preview, DeliveryRepository deliveries, RequestIntake intake,
                           GroupListRepository groupLists, GroupRepository groups, SettingsService settings,
                           MessageProperties message, CampaignService campaigns) {
        this.dispatcher = dispatcher;
        this.risk = risk;
        this.groupSync = groupSync;
        this.alerts = alerts;
        this.requests = requests;
        this.preview = preview;
        this.deliveries = deliveries;
        this.intake = intake;
        this.groupLists = groupLists;
        this.groups = groups;
        this.settings = settings;
        this.message = message;
        this.campaigns = campaigns;
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

    @PostMapping("/groups/reset-rejections")
    public ResponseEntity<?> resetRejections(@org.springframework.web.bind.annotation.RequestParam String jid) {
        return groups.resetRejections(jid, Instant.now())
                ? ResponseEntity.ok(Map.of("jid", jid))
                : ResponseEntity.notFound().build();
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
        return requests.findAll().stream().map(this::view).toList();
    }

    @PostMapping("/requests")
    public ResponseEntity<?> createRequest(@RequestBody NewRequest request) {
        try {
            var campaign = campaigns.create(new CampaignService.Input(request.draft(), null, request.groups(), null, null,
                    new Schedule(RepeatMode.ONCE, null, null, null), true));
            var run = campaigns.activeRuns(campaign.id()).getFirst();
            return ResponseEntity.status(HttpStatus.CREATED).body(view(run));
        } catch (RequestIntake.RejectedException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    private RequestView view(RequestRecord request) {
        var targets = requests.isTargeted(request.id()) ? requests.targets(request.id()).size() : null;
        return RequestView.of(request, deliveries.progress(request.id()), targets);
    }

    @PostMapping("/requests/{id}/retry")
    public ResponseEntity<?> retryFailed(@PathVariable String id) {
        var request = requests.find(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }
        if (request.status().active()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "заявка ещё отправляется — повтор будет доступен после её завершения"));
        }
        var count = deliveries.retryFailed(id, Instant.now());
        if (count == 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "в этой заявке нет групп с ошибкой"));
        }
        requests.requeue(id);
        return ResponseEntity.ok(view(requests.find(id).orElseThrow()));
    }

    @GetMapping("/requests/{id}/deliveries")
    public List<DeliveryView> deliveries(@PathVariable String id) {
        var names = groups.namesByJid();
        return deliveries.findByRequest(id).stream()
                .map(delivery -> new DeliveryView(delivery.groupJid(), names.get(delivery.groupJid()), delivery.position(),
                        delivery.status(), delivery.error()))
                .toList();
    }

    @GetMapping("/schedule")
    public Map<String, Object> schedule() {
        var dispatch = settings.dispatch();
        return Map.of(
                "windowStart", dispatch.windowStart().toString(),
                "windowEnd", dispatch.windowEnd().toString(),
                "weekendsEnabled", dispatch.weekendsEnabled(),
                "hourlyLimit", dispatch.hourlyLimit(),
                "contact", message.contact() == null ? "" : message.contact());
    }

    @GetMapping("/group-lists")
    public List<GroupListRepository.GroupList> groupLists() {
        return groupLists.findAll();
    }

    @PutMapping("/group-lists")
    public GroupListRepository.GroupList saveGroupList(@RequestBody GroupListRequest request) {
        return groupLists.save(requireListName(request), requireListGroups(request), Instant.now());
    }

    private static String requireListName(GroupListRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("нужно название списка");
        }
        return request.name().strip();
    }

    private static List<String> requireListGroups(GroupListRequest request) {
        if (request.groups() == null || request.groups().isEmpty()) {
            throw new IllegalArgumentException("в списке должна быть хотя бы одна группа");
        }
        return request.groups();
    }

    @PutMapping("/group-lists/{id}")
    public GroupListRepository.GroupList updateGroupList(@PathVariable long id, @RequestBody GroupListRequest request) {
        return campaigns.updateGroupList(id, requireListName(request), requireListGroups(request));
    }

    @DeleteMapping("/group-lists/{id}")
    public ResponseEntity<?> deleteGroupList(@PathVariable long id) {
        return groupLists.delete(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/requests/preview")
    public ResponseEntity<String> previewRequest(@RequestBody NewRequest request) {
        return ResponseEntity.ok().contentType(TEXT_UTF8).body(intake.preview(request.draft()));
    }

    public record PreviewRequest(@Nullable String id, @Nullable Map<String, String> fields) {
    }

    public record GroupListRequest(@Nullable String name, @Nullable List<String> groups) {
    }

    public record Item(@Nullable String route, @Nullable String date, @Nullable String vehicles, @Nullable String cargo, @Nullable String freight,
                       @Nullable String conditions) {
        Map<SheetField, String> fields() {
            return new NewRequest(route, date, vehicles, cargo, freight, conditions, null).fields();
        }
    }

    public record DeliveryView(String groupJid, @Nullable String groupName, int position, DeliveryStatus status, @Nullable String error) {
    }

    public record NewRequest(@Nullable String route, @Nullable String date, @Nullable String vehicles, @Nullable String cargo,
                             @Nullable String freight, @Nullable String conditions, @Nullable List<String> groups, @Nullable List<Item> items,
                             @Nullable String text, @Nullable String contact) {
        public NewRequest(String route, String date, String vehicles, String cargo, String freight, String conditions,
                          List<String> groups) {
            this(route, date, vehicles, cargo, freight, conditions, groups, null, null, null);
        }

        RequestIntake.Draft draft() {
            var rows = items == null || items.isEmpty() ? List.of(fields()) : items.stream().map(Item::fields).toList();
            return new RequestIntake.Draft(rows, text, contact);
        }

        Map<SheetField, String> fields() {
            var fields = new EnumMap<SheetField, String>(SheetField.class);
            fields.put(SheetField.ROUTE, route);
            fields.put(SheetField.DATE, date);
            fields.put(SheetField.VEHICLES, vehicles);
            fields.put(SheetField.CARGO, cargo);
            fields.put(SheetField.FREIGHT, freight);
            fields.put(SheetField.CONDITIONS, conditions);
            return fields;
        }
    }

    public record RequestView(String id, @Nullable Integer sheetRow, String message, RequestStatus status, @Nullable String error,
                              Instant queuedAt, @Nullable Instant startedAt, @Nullable Instant completedAt, DeliveryRepository.Progress progress,
                              @Nullable Integer targetGroups, @Nullable String campaignId) {
        static RequestView of(RequestRecord request, DeliveryRepository.Progress progress, Integer targetGroups) {
            return new RequestView(request.id(), request.sheetRow(), request.message(), request.status(), request.error(),
                    request.queuedAt(), request.startedAt(), request.completedAt(), progress, targetGroups, request.campaignId());
        }
    }
}
