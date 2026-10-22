package kz.wasender.dispatch;

import jakarta.annotation.PreDestroy;
import kz.wasender.config.SheetsProperties;
import kz.wasender.group.GroupRepository;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.risk.RiskType;
import kz.wasender.settings.SettingsService;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetUpdateBuffer;
import kz.wasender.time.Sleeper;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import kz.wasender.whatsapp.WhatsAppGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.random.RandomGenerator;

@Service
public class Dispatcher {
    private static final Logger log = LoggerFactory.getLogger(Dispatcher.class);

    private final RequestRepository requests;
    private final DeliveryRepository deliveries;
    private final GroupRepository groups;
    private final WhatsAppGateway gateway;
    private final WarmupService warmup;
    private final WorkWindow window;
    private final PauseRandomizer pauses;
    private final RiskMonitor risk;
    private final SheetUpdateBuffer sheet;
    private final Sleeper sleeper;
    private final Clock clock;
    private final RandomGenerator random;
    private final SettingsService settings;
    private final DateTimeFormatter completedFormat;

    private volatile DispatcherState state = DispatcherState.STARTING;
    private volatile boolean paused;
    private volatile boolean running;
    private volatile Thread worker;
    private Instant lastSendAt;
    private int sentInWave;
    private String lastRequestId;

    public Dispatcher(RequestRepository requests, DeliveryRepository deliveries, GroupRepository groups, WhatsAppGateway gateway,
                      WarmupService warmup, WorkWindow window, PauseRandomizer pauses, RiskMonitor risk, SheetUpdateBuffer sheet,
                      Sleeper sleeper, Clock clock, RandomGenerator random, SettingsService settings, SheetsProperties sheetsProperties) {
        this.requests = requests;
        this.deliveries = deliveries;
        this.groups = groups;
        this.gateway = gateway;
        this.warmup = warmup;
        this.window = window;
        this.pauses = pauses;
        this.risk = risk;
        this.sheet = sheet;
        this.sleeper = sleeper;
        this.clock = clock;
        this.random = random;
        this.settings = settings;
        this.completedFormat = DateTimeFormatter.ofPattern(sheetsProperties.completedFormat());
    }

    public synchronized void start() {
        if (running) {
            return;
        }
        recoverInterrupted();
        running = true;
        worker = Thread.ofPlatform().name("dispatcher").start(this::loop);
        log.info("DISPATCHER started");
    }

    @PreDestroy
    public void stop() {
        running = false;
        var thread = worker;
        if (thread != null) {
            thread.interrupt();
            try {
                thread.join(Duration.ofSeconds(10));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        state = DispatcherState.STOPPED;
    }

    public DispatcherState state() {
        return state;
    }

    public void pause() {
        paused = true;
        log.warn("DISPATCHER paused manually");
        changeState(gate());
    }

    public void unpause() {
        paused = false;
        log.warn("DISPATCHER unpaused manually");
        if (state == DispatcherState.PAUSED || state == DispatcherState.STOPPED_BY_RISK) {
            var gate = gate();
            changeState(gate == DispatcherState.RUNNING ? DispatcherState.IDLE : gate);
        }
    }

    public boolean paused() {
        return paused;
    }

    public int recoverInterrupted() {
        var interrupted = deliveries.findByStatus(DeliveryStatus.SENDING);
        var now = Instant.now(clock);
        for (var delivery : interrupted) {
            deliveries.updateStatus(delivery.id(), DeliveryStatus.SENT, "recovered after restart: treated as sent", now);
            log.warn("RECOVERED_AS_SENT request_id={} group_jid={} position={}", delivery.requestId(), delivery.groupJid(), delivery.position());
        }
        return interrupted.size();
    }

    private void loop() {
        while (running) {
            try {
                var wait = cycle();
                if (wait.isPositive()) {
                    sleeper.sleep(wait);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException e) {
                log.error("DISPATCHER cycle failed", e);
                try {
                    sleeper.sleep(settings.dispatch().idlePoll());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public Duration cycle() throws InterruptedException {
        var idle = settings.dispatch().idlePoll();
        var gate = gate();
        if (gate != DispatcherState.RUNNING) {
            changeState(gate);
            return idle;
        }
        var active = requests.active();
        if (active.isEmpty()) {
            changeState(DispatcherState.IDLE);
            return idle;
        }
        var open = active.stream().filter(request -> window.isOpenNow(request.windowStart(), request.windowEnd())).toList();
        if (open.isEmpty()) {
            changeState(DispatcherState.OUTSIDE_WINDOW);
            return idle;
        }
        var now = Instant.now(clock);
        Instant earliest = null;
        var withoutGroups = 0;
        for (var request : inTurn(open)) {
            if (!deliveries.hasPlan(request.id()) && !plan(request)) {
                withoutGroups++;
                continue;
            }
            if (request.status() == RequestStatus.QUEUED) {
                requests.markSending(request.id(), now);
                sheet.put(request.id(), SheetField.STATUS, RequestStatus.SENDING.sheetText());
                sheet.put(request.id(), SheetField.PROGRESS, deliveries.progress(request.id()).sheetText());
                sheet.flushAsync();
                log.info("SENDING request_id={} started", request.id());
            }
            var ready = deliveries.nextReady(request.id(), now);
            if (ready.isEmpty()) {
                var postponed = deliveries.earliestPostponed(request.id());
                if (postponed.isEmpty()) {
                    finish(request);
                    return Duration.ZERO;
                }
                earliest = earliest == null || postponed.get().isBefore(earliest) ? postponed.get() : earliest;
                continue;
            }
            lastRequestId = request.id();
            changeState(DispatcherState.RUNNING);
            deliver(request, ready.get());
            return Duration.ZERO;
        }
        if (earliest == null) {
            changeState(withoutGroups > 0 ? DispatcherState.NO_ACTIVE_GROUPS : DispatcherState.IDLE);
            return idle;
        }
        changeState(DispatcherState.WAITING_GROUPS);
        var wait = Duration.between(now, earliest);
        return wait.compareTo(idle) < 0 ? (wait.isNegative() ? Duration.ZERO : wait) : idle;
    }

    private List<RequestRecord> inTurn(List<RequestRecord> open) {
        var start = 0;
        for (var i = 0; i < open.size(); i++) {
            if (open.get(i).id().equals(lastRequestId)) {
                start = i + 1;
                break;
            }
        }
        var ordered = new ArrayList<RequestRecord>(open.size());
        for (var i = 0; i < open.size(); i++) {
            ordered.add(open.get((start + i) % open.size()));
        }
        return ordered;
    }

    private DispatcherState gate() {
        if (risk.isStopped()) {
            return DispatcherState.STOPPED_BY_RISK;
        }
        if (paused) {
            return DispatcherState.PAUSED;
        }
        if (gateway.sessionState() != SessionState.CONNECTED) {
            return DispatcherState.WAITING_SESSION;
        }
        if (warmup.limitReached()) {
            return DispatcherState.DAILY_LIMIT_REACHED;
        }
        if (hourlyLimitReached()) {
            return DispatcherState.HOURLY_LIMIT_REACHED;
        }
        return DispatcherState.RUNNING;
    }

    public int sentLastHour() {
        return deliveries.attemptsSince(Instant.now(clock).minus(Duration.ofHours(1)));
    }

    public int hourlyLimit() {
        return settings.dispatch().hourlyLimit();
    }

    private boolean hourlyLimitReached() {
        var limit = hourlyLimit();
        return limit > 0 && sentLastHour() >= limit;
    }

    private boolean plan(RequestRecord request) {
        // Заявка с выбранными группами никогда не превращается в рассылку по всем активным.
        var targeted = requests.isTargeted(request.id());
        var active = new ArrayList<>(targeted ? requests.targets(request.id()) : groups.activeJids());
        if (active.isEmpty() && !targeted) {
            return false;
        }
        Collections.shuffle(active, Random.from(random));
        deliveries.createPlan(request.id(), active, Instant.now(clock));
        var waveSize = pauses.waveSize();
        log.info("PLAN request_id={} groups={} waves={} order={}", request.id(), active.size(),
                (active.size() + waveSize - 1) / waveSize, active);
        return true;
    }

    private Duration pauseBefore() {
        if (lastSendAt == null) {
            return Duration.ZERO;
        }
        var multiplier = risk.pauseMultiplier();
        var desired = waveBoundary() ? pauses.wavePause(multiplier) : pauses.groupPause(multiplier);
        var remaining = desired.minus(Duration.between(lastSendAt, Instant.now(clock)));
        return remaining.isNegative() ? Duration.ZERO : remaining;
    }

    private boolean waveBoundary() {
        return sentInWave >= pauses.waveSize();
    }

    private void deliver(RequestRecord request, DeliveryRecord delivery) throws InterruptedException {
        var jid = delivery.groupJid();
        if (requests.isTargeted(request.id()) ? !groups.isSendable(jid) : !groups.isActive(jid)) {
            deliveries.updateStatus(delivery.id(), DeliveryStatus.SKIPPED, "group inactive", Instant.now(clock));
            log.info("SEND request_id={} group_jid={} status=SKIPPED position={} reason=group-inactive", request.id(), jid, delivery.position());
            afterDelivery(request, delivery);
            return;
        }
        if (postponeAfterOwnMessage(request, delivery)) {
            return;
        }
        var wave = waveBoundary();
        var pause = pauseBefore();
        if (pause.isPositive()) {
            log.info("PAUSE request_id={} before position={} wave_boundary={} pause_ms={}", request.id(), delivery.position(), wave, pause.toMillis());
            sleeper.sleep(pause);
            var after = gate();
            if (after != DispatcherState.RUNNING) {
                changeState(after);
                return;
            }
        }
        if (wave) {
            sentInWave = 0;
        }
        send(request, delivery, pause);
    }

    private boolean postponeAfterOwnMessage(RequestRecord request, DeliveryRecord delivery) {
        // Два наших сообщения подряд в группе выглядят как спам и повышают риск бана.
        var gap = settings.dispatch().ownMessageGap();
        if (gap == null || !gap.isPositive()) {
            return false;
        }
        var last = gateway.lastMessage(delivery.groupJid());
        if (last.isEmpty() || !last.get().fromMe()) {
            return false;
        }
        var notBefore = last.get().at().plus(gap);
        var now = Instant.now(clock);
        if (!notBefore.isAfter(now)) {
            return false;
        }
        deliveries.postpone(delivery.id(), notBefore, "ждём: последнее сообщение в группе — наше", now);
        log.info("POSTPONE request_id={} group_jid={} position={} until={} reason=own-last-message", request.id(), delivery.groupJid(),
                delivery.position(), notBefore);
        return true;
    }

    private void send(RequestRecord request, DeliveryRecord delivery, Duration pause) throws InterruptedException {
        var jid = delivery.groupJid();
        var wave = sentInWave / Math.max(1, pauses.waveSize()) + 1;
        var typing = pauses.typing();
        gateway.sendTyping(jid, true);
        sleeper.sleep(typing);
        warmup.registerAttempt();
        sentInWave++;
        deliveries.updateStatus(delivery.id(), DeliveryStatus.SENDING, null, Instant.now(clock));
        try {
            gateway.sendText(jid, request.message());
            lastSendAt = Instant.now(clock);
            deliveries.updateStatus(delivery.id(), DeliveryStatus.SENT, null, lastSendAt);
            groups.clearRejections(jid);
            gateway.sendTyping(jid, false);
            log.info("SEND request_id={} group_jid={} status=SENT position={} wave={} typing_ms={} pause_ms={} sent_today={}",
                    request.id(), jid, delivery.position(), wave, typing.toMillis(), pause.toMillis(), warmup.sentToday());
        } catch (SendException e) {
            lastSendAt = Instant.now(clock);
            deliveries.updateStatus(delivery.id(), DeliveryStatus.FAILED, e.getMessage(), lastSendAt);
            log.warn("SEND request_id={} group_jid={} status=FAILED position={} wave={} error={}", request.id(), jid, delivery.position(), wave, e.getMessage());
            if (e.groupUnavailable()) {
                groups.deactivate(jid, lastSendAt);
                log.warn("GROUP deactivated group_jid={} reason=send-rejected", jid);
            }
            // 479 — WhatsApp отказал этой группе (очень большая), а не номеру; обрыв связи — проблема сети. Оба не сигнал риска.
            if (e.connectionLost()) {
                log.warn("SEND request_id={} group_jid={} connection lost, not a risk signal", request.id(), jid);
            } else if (e.rejectedByServer()) {
                log.warn("SEND request_id={} group_jid={} rejected by WhatsApp for this group, not a risk signal", request.id(), jid);
                if (groups.recordRejection(jid, lastSendAt)) {
                    log.warn("GROUP excluded group_jid={} reason=rejected-by-whatsapp-twice", jid);
                }
            } else {
                risk.record(RiskType.SEND_FAILED, jid, request.id(), e.getMessage());
            }
        }
        afterDelivery(request, delivery);
    }

    public void close(RequestRecord request, String reason) {
        var skipped = deliveries.skipPending(request.id(), reason, Instant.now(clock));
        log.info("CLOSE request_id={} skipped={} reason=\"{}\"", request.id(), skipped, reason);
        if (deliveries.hasPlan(request.id())) {
            finish(request);
        } else {
            requests.complete(request.id(), RequestStatus.FAILED, reason, Instant.now(clock));
        }
    }

    private void afterDelivery(RequestRecord request, DeliveryRecord delivery) {
        var progress = deliveries.progress(request.id());
        sheet.put(request.id(), SheetField.PROGRESS, progress.sheetText());
        if (progress.pending() == 0) {
            finish(request);
        } else if ((delivery.position() + 1)%pauses.waveSize() == 0) {
            sheet.flushAsync();
        }
    }

    private void finish(RequestRecord request) {
        var progress = deliveries.progress(request.id());
        var now = Instant.now(clock);
        var status = progress.sent() > 0 ? RequestStatus.DONE : RequestStatus.FAILED;
        var error = status == RequestStatus.FAILED ? "не отправлено ни в одну группу" : null;
        requests.complete(request.id(), status, error, now);
        sheet.put(request.id(), SheetField.STATUS, error == null ? status.sheetText() : status.sheetText() + ": " + error);
        sheet.put(request.id(), SheetField.PROGRESS, progress.sheetText());
        sheet.put(request.id(), SheetField.COMPLETED, completedFormat.format(ZonedDateTime.ofInstant(now, clock.getZone())));
        sheet.flushAsync();
        log.info("DONE request_id={} status={} sent={} failed={} skipped={} total={}", request.id(), status,
                progress.sent(), progress.failed(), progress.skipped(), progress.total());
    }

    private void changeState(DispatcherState newState) {
        if (state != newState) {
            log.info("DISPATCHER state {} -> {}", state.label(), newState.label());
            state = newState;
        }
    }
}
