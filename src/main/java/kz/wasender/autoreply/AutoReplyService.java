package kz.wasender.autoreply;

import kz.wasender.settings.SettingsService;
import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.WhatsAppGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Автоответчик номера: на личное сообщение или звонок отвечает текстом из настроек, звонок отклоняет.
 * Одному человеку — не чаще, чем раз в cooldown, чтобы не переписываться с ботом бесконечно.
 */
@Service
public class AutoReplyService {

    private static final Logger log = LoggerFactory.getLogger(AutoReplyService.class);

    private final WhatsAppGateway gateway;
    private final SettingsService settings;
    private final JdbcClient jdbc;
    private final Clock clock;
    private final Executor executor;

    @Autowired
    public AutoReplyService(WhatsAppGateway gateway, SettingsService settings, JdbcClient jdbc, Clock clock) {
        this(gateway, settings, jdbc, clock, Executors.newVirtualThreadPerTaskExecutor());
    }

    AutoReplyService(WhatsAppGateway gateway, SettingsService settings, JdbcClient jdbc, Clock clock, Executor executor) {
        this.gateway = gateway;
        this.settings = settings;
        this.jdbc = jdbc;
        this.clock = clock;
        this.executor = executor;
        // Ответ уходит не в потоке событий моста, чтобы не задерживать события сессии.
        gateway.subscribe(event -> {
            switch (event) {
                case GatewayEvent.DirectMessage message -> executor.execute(() -> onDirectMessage(message));
                case GatewayEvent.IncomingCall call -> executor.execute(() -> onCall(call));
                default -> {
                }
            }
        });
    }

    void onDirectMessage(GatewayEvent.DirectMessage message) {
        var config = settings.autoReply();
        if (!config.enabled()) {
            return;
        }
        reply(message.chatJid(), "message", config.text(), config.cooldown());
    }

    void onCall(GatewayEvent.IncomingCall call) {
        var config = settings.autoReply();
        if (!config.rejectCalls()) {
            return;
        }
        gateway.rejectCall(call.fromJid(), call.callId());
        log.info("AUTOREPLY call rejected from={}", call.fromJid());
        if (config.enabled()) {
            reply(call.fromJid(), "call", config.text(), config.cooldown());
        }
    }

    private synchronized void reply(String jid, String kind, String text, java.time.Duration cooldown) {
        var now = Instant.now(clock);
        var last = jdbc.sql("select replied_at from autoreply_log where contact_jid = ?").param(jid).query(Instant.class).optional();
        if (last.isPresent() && last.get().plus(cooldown).isAfter(now)) {
            log.info("AUTOREPLY skipped contact={} kind={} reason=cooldown last={}", jid, kind, last.get());
            return;
        }
        try {
            gateway.sendDirect(jid, text);
            jdbc.sql("merge into autoreply_log(contact_jid, kind, replied_at) key (contact_jid) values (?, ?, ?)").params(jid, kind, now).update();
            log.info("AUTOREPLY sent contact={} kind={}", jid, kind);
        } catch (SendException e) {
            log.warn("AUTOREPLY failed contact={} kind={} error={}", jid, kind, e.getMessage());
        }
    }
}
