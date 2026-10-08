package kz.wasender.web;

import kz.wasender.config.DispatchProperties;
import kz.wasender.config.MessageProperties;
import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.dispatch.DeliveryStatus;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.group.GroupListRepository;
import kz.wasender.group.GroupRecord;
import kz.wasender.group.GroupRepository;
import kz.wasender.group.GroupSyncService;
import kz.wasender.notify.AlertService;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.sheets.SheetField;
import kz.wasender.template.PreviewService;
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
import java.util.stream.Collectors;

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
    private final DispatchProperties dispatch;
    private final MessageProperties message;

    public AdminController(Dispatcher dispatcher, RiskMonitor risk, GroupSyncService groupSync, AlertService alerts,
                           RequestRepository requests, PreviewService preview, DeliveryRepository deliveries, RequestIntake intake,
                           GroupListRepository groupLists, GroupRepository groups, DispatchProperties dispatch,
                           MessageProperties message) {
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
        this.dispatch = dispatch;
        this.message = message;
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

    /** Puts a group that WhatsApp kept rejecting back into the dispatch, e.g. after its settings changed. */
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

    /** Queues a request entered in the admin page: for the chosen groups, or for every active group when none are given. */
    @PostMapping("/requests")
    public ResponseEntity<?> createRequest(@RequestBody NewRequest request) {
        try {
            var created = intake.create(request.draft(), request.groups());
            return ResponseEntity.status(HttpStatus.CREATED).body(view(created));
        } catch (RequestIntake.RejectedException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    private RequestView view(RequestRecord request) {
        var targets = requests.isTargeted(request.id()) ? requests.targets(request.id()).size() : null;
        return RequestView.of(request, deliveries.progress(request.id()), targets);
    }

    /** Sends a finished request again to the groups where it failed; the groups it reached are not touched. */
    @PostMapping("/requests/{id}/retry")
    public ResponseEntity<?> retryFailed(@PathVariable String id) {
        var request = requests.find(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }
        if (request.status() == RequestStatus.QUEUED || request.status() == RequestStatus.SENDING) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "заявка ещё отправляется — повтор будет доступен после её завершения"));
        }
        var count = deliveries.retryFailed(id, Instant.now());
        if (count == 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "в этой заявке нет групп с ошибкой"));
        }
        requests.requeue(id);
        return ResponseEntity.ok(view(requests.find(id).orElseThrow()));
    }

    /** What happened to the request in each group, in sending order. */
    @GetMapping("/requests/{id}/deliveries")
    public List<DeliveryView> deliveries(@PathVariable String id) {
        var names = groups.findAll().stream()
                .filter(group -> group.name() != null)
                .collect(Collectors.toMap(GroupRecord::jid, GroupRecord::name));
        return deliveries.findByRequest(id).stream()
                .map(delivery -> new DeliveryView(delivery.groupJid(), names.get(delivery.groupJid()), delivery.position(),
                        delivery.status(), delivery.error()))
                .toList();
    }

    /** The dispatch schedule the admin page explains to the user. */
    @GetMapping("/schedule")
    public Map<String, Object> schedule() {
        return Map.of(
                "windowStart", dispatch.windowStart().toString(),
                "windowEnd", dispatch.windowEnd().toString(),
                "weekendsEnabled", dispatch.weekendsEnabled(),
                "contact", message.contact() == null ? "" : message.contact());
    }

    @GetMapping("/group-lists")
    public List<GroupListRepository.GroupList> groupLists() {
        return groupLists.findAll();
    }

    /** Creates the list or replaces the groups of the list with this name. */
    @PutMapping("/group-lists")
    public ResponseEntity<?> saveGroupList(@RequestBody GroupListRequest request) {
        if (request.name() == null || request.name().isBlank() || request.groups() == null || request.groups().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "нужны название и хотя бы одна группа"));
        }
        return ResponseEntity.ok(groupLists.save(request.name().strip(), request.groups(), Instant.now()));
    }

    @DeleteMapping("/group-lists/{id}")
    public ResponseEntity<?> deleteGroupList(@PathVariable long id) {
        return groupLists.delete(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/requests/preview")
    public ResponseEntity<String> previewRequest(@RequestBody NewRequest request) {
        return ResponseEntity.ok().contentType(TEXT_UTF8).body(intake.preview(request.draft()));
    }

    public record PreviewRequest(String id, Map<String, String> fields) {
    }

    public record GroupListRequest(String name, List<String> groups) {
    }

    public record Item(String route, String date, String vehicles, String cargo, String freight, String conditions) {

        Map<SheetField, String> fields() {
            return new NewRequest(route, date, vehicles, cargo, freight, conditions, null).fields();
        }
    }

    public record DeliveryView(String groupJid, String groupName, int position, DeliveryStatus status, String error) {
    }

    /**
     * A request from the admin page: either the fields of one request, or items (several requests combined into
     * one message), or a ready text sent as is. contact overrides MESSAGE_CONTACT for this message.
     */
    public record NewRequest(String route, String date, String vehicles, String cargo, String freight, String conditions,
                             List<String> groups, List<Item> items, String text, String contact) {

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

    public record RequestView(String id, Integer sheetRow, String message, RequestStatus status, String error,
                              Instant queuedAt, Instant startedAt, Instant completedAt, DeliveryRepository.Progress progress,
                              Integer targetGroups) {

        /** targetGroups is the number of chosen groups, or null when the request goes to every active group. */
        static RequestView of(RequestRecord request, DeliveryRepository.Progress progress, Integer targetGroups) {
            return new RequestView(request.id(), request.sheetRow(), request.message(), request.status(), request.error(),
                    request.queuedAt(), request.startedAt(), request.completedAt(), progress, targetGroups);
        }
    }
}
