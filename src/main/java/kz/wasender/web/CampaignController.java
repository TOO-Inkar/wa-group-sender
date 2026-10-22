package kz.wasender.web;

import kz.wasender.campaign.CampaignRecipients;
import kz.wasender.campaign.CampaignRecord;
import kz.wasender.campaign.CampaignRepository;
import kz.wasender.campaign.CampaignService;
import kz.wasender.campaign.RepeatMode;
import kz.wasender.campaign.Schedule;
import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.sheets.SheetField;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
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

@RestController
@RequestMapping("/api/admin/campaigns")
public class CampaignController {
    private static final int RUNS_IN_LIST = 5;

    private final CampaignService service;
    private final CampaignRepository campaigns;
    private final RequestRepository requests;
    private final DeliveryRepository deliveries;
    private final JsonMapper json;
    private final CampaignRecipients recipients;

    public CampaignController(CampaignService service, CampaignRepository campaigns, RequestRepository requests, DeliveryRepository deliveries,
                              JsonMapper json, CampaignRecipients recipients) {
        this.service = service;
        this.campaigns = campaigns;
        this.requests = requests;
        this.deliveries = deliveries;
        this.json = json;
        this.recipients = recipients;
    }

    @GetMapping
    public List<CampaignView> list() {
        return campaigns.findAll().stream().map(campaign -> view(campaign, RUNS_IN_LIST)).toList();
    }

    @GetMapping("/{id}")
    public CampaignView get(@PathVariable String id) {
        return view(campaigns.find(id).orElseThrow(() -> new CampaignService.NotFoundException(id)), Integer.MAX_VALUE);
    }

    @PostMapping
    public ResponseEntity<CampaignView> create(@RequestBody CampaignForm form) {
        var created = service.create(input(form));
        return ResponseEntity.status(HttpStatus.CREATED).body(view(created, RUNS_IN_LIST));
    }

    @PutMapping("/{id}")
    public CampaignView update(@PathVariable String id, @RequestBody CampaignForm form) {
        return view(service.update(id, input(form)), RUNS_IN_LIST);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
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
        var current = runs.stream().filter(r -> r.status().active()).findFirst()
                .map(this::run).orElse(null);
        var to = recipients.of(campaign);
        var schedule = campaign.schedule();
        return new CampaignView(campaign.id(), campaign.title(), campaign.message(), campaign.draft(), campaign.targeted(), to.label(),
                to.groups().stream().map(group -> new Target(group.jid(), group.name())).toList(),
                schedule.mode(), schedule.start() == null ? null : schedule.start().toString(),
                schedule.end() == null ? null : schedule.end().toString(), schedule.intervalMinutes(),
                campaign.enabled(), campaign.createdAt(), campaign.updatedAt(), campaign.nextRunAt(), campaign.lastRunAt(),
                current, runs.size(), shown);
    }

    private Run run(RequestRecord request) {
        return new Run(request.id(), request.status(), request.error(), request.queuedAt(), request.startedAt(), request.completedAt(),
                deliveries.progress(request.id()));
    }

    public record Content(@Nullable String mode, @Nullable List<AdminController.Item> items, @Nullable String text, @Nullable String contact) {
        RequestIntake.Draft draft() {
            if ("text".equals(mode)) {
                return new RequestIntake.Draft(List.of(), text == null ? "" : text, null);
            }
            var rows = items == null ? List.<Map<SheetField, String>>of() : items.stream().map(AdminController.Item::fields).toList();
            return new RequestIntake.Draft(rows, null, contact);
        }
    }

    public record Repeat(@Nullable RepeatMode mode, @Nullable String start, @Nullable String end, @Nullable Integer intervalMinutes) {
    }

    public record CampaignForm(@Nullable String title, @Nullable Content content, @Nullable List<String> groups, @Nullable String targetLabel,
                               @Nullable Repeat repeat, @Nullable Boolean sendNow) {
    }

    public record Target(String jid, String name) {
    }

    public record Run(String id, RequestStatus status, @Nullable String error, Instant queuedAt, @Nullable Instant startedAt, @Nullable Instant completedAt,
                      DeliveryRepository.Progress progress) {
    }

    public record CampaignView(String id, String title, String message, @Nullable String form, boolean targeted, @Nullable String targetLabel,
                               List<Target> targets, RepeatMode repeatMode, @Nullable String startTime, @Nullable String endTime,
                               @Nullable Integer intervalMinutes, boolean enabled, Instant createdAt, Instant updatedAt,
                               @Nullable Instant nextRunAt, @Nullable Instant lastRunAt, @Nullable Run current, int runCount, List<Run> runs) {
    }
}
