package kz.wasender.web;

import kz.wasender.dispatch.Dispatcher;
import kz.wasender.dispatch.WarmupService;
import kz.wasender.engine.CurrentTenant;
import kz.wasender.engine.EngineUnavailableException;
import kz.wasender.engine.TenantEngines;
import kz.wasender.group.GroupRepository;
import kz.wasender.request.RequestRepository;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.whatsapp.WhatsAppGateway;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.OffsetDateTime;

@RestController
public class HealthController {
    private final WhatsAppGateway gateway;
    private final RequestRepository requests;
    private final GroupRepository groups;
    private final WarmupService warmup;
    private final Dispatcher dispatcher;
    private final RiskMonitor risk;
    private final Clock clock;
    private final TenantEngines engines;

    public HealthController(WhatsAppGateway gateway, RequestRepository requests, GroupRepository groups, WarmupService warmup,
                            Dispatcher dispatcher, RiskMonitor risk, Clock clock, TenantEngines engines) {
        this.gateway = gateway;
        this.requests = requests;
        this.groups = groups;
        this.warmup = warmup;
        this.dispatcher = dispatcher;
        this.risk = risk;
        this.clock = clock;
        this.engines = engines;
    }

    @GetMapping({"/api/health", "/api/admin/health"})
    public Health health() {
        var running = engines.running();
        var tenant = CurrentTenant.get().orElseGet(() -> running.stream().findFirst()
                .map(engine -> engine.info().id())
                .orElseThrow(() -> new EngineUnavailableException("Нет запущенных кабинетов")));
        return CurrentTenant.callAs(tenant, () -> snapshot(running.size()));
    }

    private Health snapshot(int tenants) {
        var today = warmup.today();
        return new Health(
                "UP",
                gateway.sessionState().name(),
                requests.queueLength(),
                warmup.sentToday(),
                warmup.limitFor(today),
                warmup.warmupDay(today),
                dispatcher.state().label(),
                risk.isStopped(),
                risk.eventsInWindow(),
                risk.pauseMultiplier(),
                groups.activeCount(),
                dispatcher.sentLastHour(),
                dispatcher.hourlyLimit(),
                OffsetDateTime.now(clock).toString(),
                tenants);
    }

    public record Health(
            String status,
            String session,
            int queueLength,
            int sentToday,
            @Nullable Integer warmupLimitToday,
            int warmupDay,
            String dispatcher,
            boolean stoppedByRisk,
            int riskEventsInWindow,
            double pauseMultiplier,
            long activeGroups,
            int sentLastHour,
            int hourlyLimit,
            String time,
            int tenants) {
    }
}
