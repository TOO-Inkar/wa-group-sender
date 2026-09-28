package kz.inkar.wasender.risk;

import kz.inkar.wasender.config.RiskProperties;
import kz.inkar.wasender.notify.AlertService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
public class RiskMonitor {

    private static final Logger log = LoggerFactory.getLogger(RiskMonitor.class);

    private final RiskEventRepository repository;
    private final RiskProperties properties;
    private final AlertService alerts;
    private final Clock clock;
    private volatile Boolean stopped;

    public RiskMonitor(RiskEventRepository repository, RiskProperties properties, AlertService alerts, Clock clock) {
        this.repository = repository;
        this.properties = properties;
        this.alerts = alerts;
        this.clock = clock;
    }

    public synchronized void record(RiskType type, String groupJid, String requestId, String detail) {
        repository.insert(type, groupJid, requestId, detail, Instant.now(clock));
        var count = eventsInWindow();
        log.warn("RISK type={} request_id={} group_jid={} window_count={} detail={}", type, requestId, groupJid, count, detail);
        if (count >= properties.criticalThreshold()) {
            if (!isStopped()) {
                stop("критический порог риска: " + count + " сигналов за " + properties.window());
            }
        } else if (count >= properties.warnThreshold()) {
            alerts.alert("risk-warn", "Порог предупреждения риска: " + count + " сигналов за " + properties.window()
                    + ". Паузы увеличены в " + properties.pauseMultiplier() + " раза. Последний сигнал: " + type
                    + (groupJid == null ? "" : " " + groupJid));
        }
    }

    public synchronized void stop(String reason) {
        repository.insert(RiskType.RISK_STOP, null, null, reason, Instant.now(clock));
        stopped = true;
        log.error("RISK dispatch stopped: {}", reason);
        alerts.alert("risk-stop", "Рассылка ОСТАНОВЛЕНА: " + reason + ". Проверьте номер и возобновите вручную: POST /api/admin/resume.");
    }

    public synchronized void resume() {
        repository.insert(RiskType.RESUMED, null, null, "manual resume", Instant.now(clock));
        stopped = false;
        log.warn("RISK dispatch resumed manually");
    }

    public boolean isStopped() {
        var value = stopped;
        if (value == null) {
            value = repository.latestOf(List.of(RiskType.RISK_STOP, RiskType.RESUMED))
                    .map(event -> event.type() == RiskType.RISK_STOP)
                    .orElse(false);
            stopped = value;
        }
        return value;
    }

    public int eventsInWindow() {
        var since = Instant.now(clock).minus(properties.window());
        var resumedAt = repository.latestOf(List.of(RiskType.RESUMED)).map(RiskEventRepository.RiskEvent::at).orElse(Instant.EPOCH);
        if (resumedAt.isAfter(since)) {
            since = resumedAt;
        }
        return repository.countSince(since, RiskType.SIGNALS);
    }

    public double pauseMultiplier() {
        return eventsInWindow() >= properties.warnThreshold() ? properties.pauseMultiplier() : 1.0;
    }
}
