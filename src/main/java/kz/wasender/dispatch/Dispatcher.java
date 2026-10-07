package kz.wasender.dispatch;

import jakarta.annotation.PreDestroy;
import kz.wasender.config.DispatchProperties;
import kz.wasender.config.SheetsProperties;
import kz.wasender.group.GroupRepository;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.risk.RiskType;
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
    private final DispatchProperties properties;
    private final DateTimeFormatter completedFormat;

    private volatile DispatcherState state = DispatcherState.STARTING;
    private volatile boolean paused;
    private volatile boolean running;
    private volatile Thread worker;
    private Instant lastSendAt;

    public Dispatcher(RequestRepository requests, DeliveryRepository deliveries, GroupRepository groups, WhatsAppGateway gateway,
                      WarmupService warmup, WorkWindow window, PauseRandomizer pauses, RiskMonitor risk, SheetUpdateBuffer sheet,
                      Sleeper sleeper, Clock clock, RandomGenerator random, DispatchProperties properties, SheetsProperties sheetsProperties) {
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
        this.properties = properties;
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
    }

    public void unpause() {
        paused = false;
        log.warn("DISPATCHER unpaused manually");
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
                    sleeper.sleep(properties.idlePoll());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public Duration cycle() throws InterruptedException {
        var gate = gate();
        if (gate != DispatcherState.RUNNING) {
            changeState(gate);
            return properties.idlePoll();
        }
        var next = requests.nextInQueue();
        if (next.isEmpty()) {
            changeState(DispatcherState.IDLE);
            return properties.idlePoll();
        }
        var request = next.get();
        if (!deliveries.hasPlan(request.id()) && !plan(request)) {
            changeState(DispatcherState.NO_ACTIVE_GROUPS);
            return properties.idlePoll();
        }
        changeState(DispatcherState.RUNNING);
        if (request.status() == RequestStatus.QUEUED) {
            requests.markSending(request.id(), Instant.now(clock));
            sheet.put(request.id(), SheetField.STATUS, RequestStatus.SENDING.sheetText());
            sheet.put(request.id(), SheetField.PROGRESS, deliveries.progress(request.id()).sheetText());
            sheet.flushAsync();
            log.info("SENDING request_id={} started", request.id());
        }
        var pending = deliveries.nextPending(request.id());
        if (pending.isEmpty()) {
            finish(request);
            return Duration.ZERO;
        }
        var delivery = pending.get();
        var pause = pauseBefore(delivery);
        if (pause.isPositive()) {
            log.info("PAUSE request_id={} before position={} wave_boundary={} pause_ms={}", request.id(), delivery.position(),
                    waveBoundary(delivery), pause.toMillis());
            sleeper.sleep(pause);
            var after = gate();
            if (after != DispatcherState.RUNNING) {
                changeState(after);
                return Duration.ZERO;
            }
        }
        send(request, delivery, pause);
        return Duration.ZERO;
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
        if (!window.isOpenNow()) {
            return DispatcherState.OUTSIDE_WINDOW;
        }
        if (warmup.limitReached()) {
            return DispatcherState.DAILY_LIMIT_REACHED;
        }
        return DispatcherState.RUNNING;
    }

    private boolean plan(RequestRecord request) {
        // A request with chosen groups is planned for exactly them, even if none can be written to now:
        // those are skipped at send time, and the request never falls back to every active group.
        var targeted = requests.isTargeted(request.id());
        var active = new ArrayList<>(targeted ? requests.targets(request.id()) : groups.activeJids());
        if (active.isEmpty() && !targeted) {
            return false;
        }
        Collections.shuffle(active, Random.from(random));
        deliveries.createPlan(request.id(), active, Instant.now(clock));
        log.info("PLAN request_id={} groups={} waves={} order={}", request.id(), active.size(),
                (active.size() + properties.waveSize() - 1) / properties.waveSize(), active);
        return true;
    }

    private Duration pauseBefore(DeliveryRecord delivery) {
        if (lastSendAt == null) {
            return Duration.ZERO;
        }
        var multiplier = risk.pauseMultiplier();
        var desired = waveBoundary(delivery) ? pauses.wavePause(multiplier) : pauses.groupPause(multiplier);
        var remaining = desired.minus(Duration.between(lastSendAt, Instant.now(clock)));
        return remaining.isNegative() ? Duration.ZERO : remaining;
    }

    private boolean waveBoundary(DeliveryRecord delivery) {
        return delivery.position() > 0 && delivery.position()%properties.waveSize() == 0;
    }

    private void send(RequestRecord request, DeliveryRecord delivery, Duration pause) throws InterruptedException {
        var jid = delivery.groupJid();
        var wave = delivery.position() / properties.waveSize() + 1;
        if (requests.isTargeted(request.id()) ? !groups.isSendable(jid) : !groups.isActive(jid)) {
            deliveries.updateStatus(delivery.id(), DeliveryStatus.SKIPPED, "group inactive", Instant.now(clock));
            log.info("SEND request_id={} group_jid={} status=SKIPPED position={} wave={} reason=group-inactive", request.id(), jid, delivery.position(), wave);
            afterDelivery(request, delivery);
            return;
        }
        var typing = pauses.typing();
        gateway.sendTyping(jid, true);
        sleeper.sleep(typing);
        warmup.registerAttempt();
        deliveries.updateStatus(delivery.id(), DeliveryStatus.SENDING, null, Instant.now(clock));
        try {
            gateway.sendText(jid, request.message());
            lastSendAt = Instant.now(clock);
            deliveries.updateStatus(delivery.id(), DeliveryStatus.SENT, null, lastSendAt);
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
            if (e.rejectedByServer()) {
                // 479 comes back for the same large groups every time, so it is neither retried nor a risk signal;
                // GROUPS_MAX_PARTICIPANTS keeps such groups out of the dispatch once their size is known.
                log.warn("SEND request_id={} group_jid={} rejected by WhatsApp for this group (too large), not a risk signal", request.id(), jid);
            } else {
                risk.record(RiskType.SEND_FAILED, jid, request.id(), e.getMessage());
            }
        }
        afterDelivery(request, delivery);
    }

    private void afterDelivery(RequestRecord request, DeliveryRecord delivery) {
        var progress = deliveries.progress(request.id());
        sheet.put(request.id(), SheetField.PROGRESS, progress.sheetText());
        if (progress.pending() == 0) {
            finish(request);
        } else if ((delivery.position() + 1)%properties.waveSize() == 0) {
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
