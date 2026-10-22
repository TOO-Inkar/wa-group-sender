package kz.wasender.campaign;

import kz.wasender.dispatch.Dispatcher;
import kz.wasender.dispatch.WorkWindow;
import kz.wasender.group.GroupRecord;
import kz.wasender.group.GroupRepository;
import kz.wasender.request.RequestIdGenerator;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Заявки из админки и их расписание. Каждая отправка заявки — новая рассылка (request) со своим планом;
 * диспетчер ведёт несколько рассылок сразу, деля между ними паузы и лимиты номера.
 */
@Service
public class CampaignService {

    private static final Logger log = LoggerFactory.getLogger(CampaignService.class);
    private static final int MAX_TITLE = 200;
    private static final int MAX_LABEL = 500;

    private final CampaignRepository campaigns;
    private final RequestRepository requests;
    private final RequestIdGenerator requestIds;
    private final RequestIntake intake;
    private final GroupRepository groups;
    private final Dispatcher dispatcher;
    private final WorkWindow window;
    private final Clock clock;

    public CampaignService(CampaignRepository campaigns, RequestRepository requests, RequestIdGenerator requestIds, RequestIntake intake,
                           GroupRepository groups, Dispatcher dispatcher, WorkWindow window, Clock clock) {
        this.campaigns = campaigns;
        this.requests = requests;
        this.requestIds = requestIds;
        this.intake = intake;
        this.groups = groups;
        this.dispatcher = dispatcher;
        this.window = window;
        this.clock = clock;
    }

    @Transactional
    public synchronized CampaignRecord create(Input input) {
        var targets = targets(input);
        var message = intake.compose(input.draft(), null, targets);
        var now = Instant.now(clock);
        var first = input.sendNow() ? ZonedDateTime.now(clock) : input.schedule().first(ZonedDateTime.now(clock), window.end(), window.weekendsEnabled());
        var campaign = new CampaignRecord(nextId(), title(input, message), input.form(), message, !targets.isEmpty(), label(input, targets),
                input.schedule(), true, false, now, now, first == null ? null : first.toInstant(), null);
        campaigns.insert(campaign, targets);
        log.info("CAMPAIGN created id={} title=\"{}\" repeat={} start={} end={} interval={} targets={} first_run={}", campaign.id(),
                campaign.title(), campaign.schedule().mode(), campaign.schedule().start(), campaign.schedule().end(),
                campaign.schedule().intervalMinutes(), targets.isEmpty() ? "all-active" : targets.size(), campaign.nextRunAt());
        runDue(campaign.id());
        return campaigns.find(campaign.id()).orElseThrow();
    }

    /**
     * Меняет текст, адресатов и расписание. Ещё не начатая рассылка получает новый текст;
     * уже идущая досылает старый, новый уйдёт со следующей.
     */
    @Transactional
    public synchronized CampaignRecord update(String id, Input input) {
        var current = campaigns.find(id).orElseThrow(() -> new NotFoundException(id));
        var targets = targets(input);
        var message = intake.compose(input.draft(), null, targets);
        var now = Instant.now(clock);
        var next = current.nextRunAt();
        if (current.enabled() && !current.schedule().equals(input.schedule())) {
            var first = input.schedule().first(ZonedDateTime.now(clock), window.end(), window.weekendsEnabled());
            next = first == null ? null : first.toInstant();
        }
        var updated = new CampaignRecord(id, title(input, message), input.form(), message, !targets.isEmpty(), label(input, targets),
                input.schedule(), current.enabled(), false, current.createdAt(), now, next, current.lastRunAt());
        campaigns.update(updated, targets);
        var queued = requests.updateQueuedMessage(id, message, targets);
        log.info("CAMPAIGN updated id={} repeat={} queued_runs_updated={} next_run={}", id, input.schedule().mode(), queued, next);
        if (input.sendNow()) {
            runNow(id);
        }
        return campaigns.find(id).orElseThrow();
    }

    /** Заявка удаляется из списка, её незаконченная рассылка останавливается; история остаётся в отчётах. */
    @Transactional
    public synchronized void delete(String id) {
        campaigns.find(id).orElseThrow(() -> new NotFoundException(id));
        closeActive(id, "заявка удалена");
        campaigns.markDeleted(id, Instant.now(clock));
        log.info("CAMPAIGN deleted id={}", id);
    }

    /** Выключенная заявка не рассылается по расписанию, идущая рассылка останавливается. */
    @Transactional
    public synchronized CampaignRecord setEnabled(String id, boolean enabled) {
        var campaign = campaigns.find(id).orElseThrow(() -> new NotFoundException(id));
        var now = Instant.now(clock);
        if (!enabled) {
            closeActive(id, "заявка остановлена");
            campaigns.setEnabled(id, false, null, now);
            log.info("CAMPAIGN disabled id={}", id);
        } else {
            var first = campaign.schedule().first(ZonedDateTime.now(clock), window.end(), window.weekendsEnabled());
            campaigns.setEnabled(id, true, first == null ? null : first.toInstant(), now);
            log.info("CAMPAIGN enabled id={} next_run={}", id, first);
            runDue(id);
        }
        return campaigns.find(id).orElseThrow();
    }

    /** Разослать заявку прямо сейчас, не дожидаясь расписания. */
    @Transactional
    public synchronized RequestRecord runNow(String id) {
        var campaign = campaigns.find(id).orElseThrow(() -> new NotFoundException(id));
        if (!activeRuns(id).isEmpty()) {
            throw new ConflictException("эта заявка ещё рассылается — дождитесь окончания или остановите её");
        }
        return spawn(campaign, Instant.now(clock)).orElseThrow();
    }

    /** Запускает рассылки заявок, чьё время подошло; вызывается по таймеру. Возвращает, сколько запущено. */
    @Transactional
    public synchronized int tick() {
        var started = 0;
        for (var campaign : campaigns.due(Instant.now(clock))) {
            if (process(campaign)) {
                started++;
            }
        }
        return started;
    }

    public void tickQuietly() {
        try {
            tick();
        } catch (RuntimeException e) {
            log.error("CAMPAIGN schedule tick failed", e);
        }
    }

    public List<RequestRecord> activeRuns(String id) {
        return requests.findByCampaign(id).stream()
                .filter(run -> run.status() == RequestStatus.QUEUED || run.status() == RequestStatus.SENDING)
                .toList();
    }

    private void runDue(String id) {
        campaigns.find(id).filter(c -> c.enabled() && c.nextRunAt() != null && !c.nextRunAt().isAfter(Instant.now(clock)))
                .ifPresent(this::process);
    }

    private boolean process(CampaignRecord campaign) {
        var now = Instant.now(clock);
        var spawned = spawn(campaign, now);
        var next = campaign.schedule().nextAfter(ZonedDateTime.now(clock), window.end(), window.weekendsEnabled());
        campaigns.scheduled(campaign.id(), spawned.isPresent() ? now : null, next == null ? null : next.toInstant(), next != null);
        log.info("CAMPAIGN tick id={} started={} next_run={}", campaign.id(), spawned.map(RequestRecord::id).orElse("-"), next);
        return spawned.isPresent();
    }

    /**
     * Новая рассылка заявки. Если прошлая ещё идёт с сегодняшнего дня — этот запуск пропускается (номер не разгоняем);
     * если она со вчера и раньше — она устарела, закрывается, и стартует новая.
     */
    private Optional<RequestRecord> spawn(CampaignRecord campaign, Instant now) {
        var today = LocalDate.now(clock);
        for (var previous : activeRuns(campaign.id())) {
            if (LocalDate.ofInstant(previous.queuedAt(), clock.getZone()).isBefore(today)) {
                dispatcher.close(previous, "устарела: заявка разослана заново");
            } else {
                log.warn("CAMPAIGN occurrence skipped id={} reason=previous-run-still-sending run_id={}", campaign.id(), previous.id());
                return Optional.empty();
            }
        }
        var schedule = campaign.schedule();
        var ownWindow = schedule.mode() != RepeatMode.ONCE || schedule.start() != null;
        var id = requestIds.next(List.of());
        var targets = campaign.targeted() ? campaigns.targets(campaign.id()) : List.<String>of();
        requests.insertRun(id, campaign.id(), campaign.message(), now, targets,
                ownWindow ? schedule.start() : null, ownWindow ? schedule.end() : null);
        log.info("QUEUED request_id={} source=campaign campaign_id={} targets={} window={}", id, campaign.id(),
                targets.isEmpty() ? "all-active" : targets.size(), ownWindow ? schedule.start() + "-" + (schedule.end() == null ? "window-end" : schedule.end()) : "common");
        return requests.find(id);
    }

    private void closeActive(String id, String reason) {
        for (var run : activeRuns(id)) {
            dispatcher.close(run, reason);
        }
    }

    private List<String> targets(Input input) {
        return input.groups() == null ? List.of() : List.copyOf(new LinkedHashSet<>(input.groups()));
    }

    private String nextId() {
        var max = campaigns.findAllIds().stream()
                .filter(id -> id.matches("\\d{1,15}"))
                .mapToLong(Long::parseLong)
                .max()
                .orElse(0);
        return Long.toString(max + 1);
    }

    /** Название заявки: заданное вручную, маршрут из полей или первая строка готового текста. */
    private static String title(Input input, String message) {
        var title = input.title() == null ? "" : input.title().strip();
        var items = input.draft().isText() ? List.<java.util.Map<kz.wasender.sheets.SheetField, String>>of() : input.draft().items();
        if (title.isEmpty() && !items.isEmpty()) {
            var route = items.getFirst().get(kz.wasender.sheets.SheetField.ROUTE);
            if (route != null && !route.isBlank()) {
                title = route.strip() + (items.size() > 1 ? " и ещё " + (items.size() - 1) : "");
            }
        }
        if (title.isEmpty()) {
            title = message.lines().map(String::strip).filter(line -> !line.isEmpty()).findFirst().orElse("Заявка")
                    .replaceAll("[*_~`]", "").strip();
        }
        return title.length() > MAX_TITLE ? title.substring(0, MAX_TITLE - 1) + "…" : title;
    }

    /** Как показать адресатов: название списка из админки или названия выбранных групп. */
    private String label(Input input, List<String> targets) {
        if (targets.isEmpty()) {
            return null;
        }
        if (input.targetLabel() != null && !input.targetLabel().isBlank()) {
            var label = input.targetLabel().strip();
            return label.length() > MAX_LABEL ? label.substring(0, MAX_LABEL - 1) + "…" : label;
        }
        var names = groups.findAll().stream().filter(g -> g.name() != null && !g.name().isBlank())
                .collect(Collectors.toMap(GroupRecord::jid, GroupRecord::name, (a, b) -> a));
        var shown = targets.stream().limit(3).map(jid -> names.getOrDefault(jid, jid)).collect(Collectors.joining(", "));
        var label = targets.size() > 3 ? shown + " и ещё " + (targets.size() - 3) : shown;
        return label.length() > MAX_LABEL ? label.substring(0, MAX_LABEL - 1) + "…" : label;
    }

    public Function<String, String> groupNames() {
        var names = groups.findAll().stream().filter(g -> g.name() != null && !g.name().isBlank())
                .collect(Collectors.toMap(GroupRecord::jid, GroupRecord::name, (a, b) -> a));
        return jid -> names.getOrDefault(jid, jid);
    }

    /**
     * Что приходит со страницы: draft — содержимое для проверки и сборки текста, form — те же поля в JSON для повторного
     * открытия, groups — адресаты (пусто — все активные группы), sendNow — первая рассылка сразу.
     */
    public record Input(RequestIntake.Draft draft, String form, List<String> groups, String title, String targetLabel, Schedule schedule,
                        boolean sendNow) {
    }

    public static class NotFoundException extends RuntimeException {

        public NotFoundException(String id) {
            super("заявка " + id + " не найдена");
        }
    }

    public static class ConflictException extends RuntimeException {

        public ConflictException(String message) {
            super(message);
        }
    }
}
