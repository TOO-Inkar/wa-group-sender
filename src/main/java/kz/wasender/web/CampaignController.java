package kz.wasender.web;

import kz.wasender.campaign.CampaignRecord;
import kz.wasender.campaign.CampaignService;
import kz.wasender.campaign.RepeatMode;
import kz.wasender.campaign.Schedule;
import kz.wasender.campaign.CampaignRepository;
import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.group.GroupListRepository;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/** Заявки из админки: список с рассылками, создание, правка, удаление, включение, запуск вручную. */
@RestController
@RequestMapping("/api/admin/campaigns")
public class CampaignController {

    private static final int RUNS_IN_LIST = 5;

    private final CampaignService service;
    private final CampaignRepository campaigns;
    private final RequestRepository requests;
    private final DeliveryRepository deliveries;
    private final JsonMapper json;
    private final GroupListRepository groupLists;

    public CampaignController(CampaignService service, CampaignRepository campaigns, RequestRepository requests, DeliveryRepository deliveries,
                              JsonMapper json, GroupListRepository groupLists) {
        this.service = service;
        this.campaigns = campaigns;
        this.requests = requests;
        this.deliveries = deliveries;
        this.json = json;
        this.groupLists = groupLists;
    }

    @GetMapping
    public List<CampaignView> list() {
        return campaigns.findAll().stream().map(campaign -> view(campaign, RUNS_IN_LIST)).toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id) {
        return campaigns.find(id).<ResponseEntity<?>>map(campaign -> ResponseEntity.ok(view(campaign, Integer.MAX_VALUE)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CampaignForm form) {
        var created = service.create(input(form));
        return ResponseEntity.status(HttpStatus.CREATED).body(view(created, RUNS_IN_LIST));
    }

    @PutMapping("/{id}")
    public CampaignView update(@PathVariable String id, @RequestBody CampaignForm form) {
        return view(service.update(id, input(form)), RUNS_IN_LIST);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/enable")
    public CampaignView enable(@PathVariable String id) {
        return view(service.setEnabled(id, true), RUNS_IN_LIST);
    }

    @PostMapping("/{id}/disable")
    public CampaignView disable(@PathVariable String id) {
        return view(service.setEnabled(id, false), RUNS_IN_LIST);
    }

    @PostMapping("/{id}/run")
    public CampaignView runNow(@PathVariable String id) {
        service.runNow(id);
        return view(campaigns.find(id).orElseThrow(), RUNS_IN_LIST);
    }

    @ExceptionHandler({RequestIntake.RejectedException.class, IllegalArgumentException.class})
    ResponseEntity<?> rejected(RuntimeException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(CampaignService.NotFoundException.class)
    ResponseEntity<?> notFound(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(CampaignService.ConflictException.class)
    ResponseEntity<?> conflict(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
    }

    private CampaignService.Input input(CampaignForm form) {
        var content = form.content() == null ? new Content(null, null, null, null) : form.content();
        var repeat = form.repeat() == null ? new Repeat(RepeatMode.ONCE, null, null, null) : form.repeat();
        var schedule = new Schedule(repeat.mode() == null ? RepeatMode.ONCE : repeat.mode(), time(repeat.start(), "время начала"),
                time(repeat.end(), "время окончания"), repeat.intervalMinutes());
        return new CampaignService.Input(content.draft(), json.writeValueAsString(content), form.groups(), form.title(), form.targetLabel(),
                schedule, form.sendNow() == null || form.sendNow());
    }

    private static LocalTime time(String value, String what) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(value.strip());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(what + ": время в виде ЧЧ:ММ, например 05:00");
        }
    }

    private CampaignView view(CampaignRecord campaign, int runLimit) {
        var runs = requests.findByCampaign(campaign.id());
        var shown = runs.stream().limit(runLimit).map(this::run).toList();
        var current = runs.stream().filter(r -> r.status() == RequestStatus.QUEUED || r.status() == RequestStatus.SENDING).findFirst()
                .map(this::run).orElse(null);
        var targets = campaign.targeted() ? campaigns.targets(campaign.id()) : List.<String>of();
        var names = service.groupNames();
        var schedule = campaign.schedule();
        return new CampaignView(campaign.id(), campaign.title(), campaign.message(), campaign.draft(), campaign.targeted(),
                targetLabel(campaign, targets, names),
                targets.stream().map(jid -> new Target(jid, names.apply(jid))).toList(),
                schedule.mode(), schedule.start() == null ? null : schedule.start().toString(),
                schedule.end() == null ? null : schedule.end().toString(), schedule.intervalMinutes(),
                campaign.enabled(), campaign.createdAt(), campaign.updatedAt(), campaign.nextRunAt(), campaign.lastRunAt(),
                current, runs.size(), shown);
    }

    /**
     * Как показать адресатов. У заявок, созданных до сохранения названия, его нет: тогда название списка групп
     * с теми же группами, а если такого списка нет — названия самих групп.
     */
    private String targetLabel(CampaignRecord campaign, List<String> targets, java.util.function.Function<String, String> names) {
        if (!campaign.targeted() || (campaign.targetLabel() != null && !campaign.targetLabel().isBlank())) {
            return campaign.targetLabel();
        }
        var set = new java.util.HashSet<>(targets);
        var list = groupLists.findAll().stream().filter(l -> new java.util.HashSet<>(l.groups()).equals(set)).findFirst();
        if (list.isPresent()) {
            return list.get().name();
        }
        var shown = targets.stream().limit(3).map(names).collect(java.util.stream.Collectors.joining(", "));
        return targets.size() > 3 ? shown + " и ещё " + (targets.size() - 3) : shown;
    }

    private Run run(RequestRecord request) {
        return new Run(request.id(), request.status(), request.error(), request.queuedAt(), request.startedAt(), request.completedAt(),
                deliveries.progress(request.id()));
    }

    /** Содержимое формы: по полям (items, contact) или готовый текст (text). */
    public record Content(String mode, List<AdminController.Item> items, String text, String contact) {

        RequestIntake.Draft draft() {
            if ("text".equals(mode)) {
                return new RequestIntake.Draft(List.of(), text == null ? "" : text, null);
            }
            var rows = items == null ? List.<Map<kz.wasender.sheets.SheetField, String>>of() : items.stream().map(AdminController.Item::fields).toList();
            return new RequestIntake.Draft(rows, null, contact);
        }
    }

    /** Расписание: mode ONCE/DAILY/INTERVAL, start и end — «ЧЧ:ММ», intervalMinutes — для INTERVAL. */
    public record Repeat(RepeatMode mode, String start, String end, Integer intervalMinutes) {
    }

    /** sendNow — первая рассылка сразу, не дожидаясь времени старта (по умолчанию да). */
    public record CampaignForm(String title, Content content, List<String> groups, String targetLabel, Repeat repeat, Boolean sendNow) {
    }

    public record Target(String jid, String name) {
    }

    public record Run(String id, RequestStatus status, String error, Instant queuedAt, Instant startedAt, Instant completedAt,
                      DeliveryRepository.Progress progress) {
    }

    /** form — поля формы в JSON (для правки); current — идущая рассылка; runs — последние рассылки, новые первыми. */
    public record CampaignView(String id, String title, String message, String form, boolean targeted, String targetLabel,
                               List<Target> targets, RepeatMode repeatMode, String startTime, String endTime, Integer intervalMinutes,
                               boolean enabled, Instant createdAt, Instant updatedAt, Instant nextRunAt, Instant lastRunAt,
                               Run current, int runCount, List<Run> runs) {
    }
}
