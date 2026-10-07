package kz.wasender.report;

import kz.wasender.dispatch.DeliveryStatus;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.request.RequestStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class ReportService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final RequestRepository requests;
    private final JdbcClient jdbc;
    private final Clock clock;

    public ReportService(RequestRepository requests, JdbcClient jdbc, Clock clock) {
        this.requests = requests;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Every request queued from the start of {@code from} to the end of {@code to}, in the service time zone. */
    public Report period(LocalDate from, LocalDate to) {
        var zone = clock.getZone();
        var list = requests.findQueuedBetween(from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant());
        var scope = from.equals(to) ? "за " + from.format(DAY) : "с " + from.format(DAY) + " по " + to.format(DAY);
        return build("Отчёт о рассылке", scope, list, null);
    }

    public Optional<Report> request(String id) {
        return requests.find(id).map(request -> build("Отчёт о рассылке заявки №" + request.id(),
                "заявка создана " + time(request.queuedAt()).format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")),
                List.of(request), request.message()));
    }

    private Report build(String title, String scope, List<RequestRecord> list, String message) {
        var requestRows = new ArrayList<Report.RequestRow>();
        var deliveryRows = new ArrayList<Report.DeliveryRow>();
        var groups = new LinkedHashMap<String, int[]>();
        var reached = new HashSet<String>();
        int sent = 0, failed = 0, skipped = 0, pending = 0;
        for (var request : list) {
            var deliveries = deliveries(request.id());
            int rSent = 0, rFailed = 0, rSkipped = 0;
            for (var delivery : deliveries) {
                var name = groupName(delivery);
                var counts = groups.computeIfAbsent(name, key -> new int[2]);
                switch (delivery.status()) {
                    case SENT -> {
                        rSent++;
                        counts[0]++;
                        reached.add(delivery.groupJid());
                    }
                    case FAILED -> {
                        rFailed++;
                        counts[1]++;
                    }
                    case SKIPPED -> rSkipped++;
                    default -> pending++;
                }
                deliveryRows.add(new Report.DeliveryRow(request.id(), name,
                        delivery.status() == DeliveryStatus.PENDING ? null : time(delivery.updatedAt()),
                        deliveryStatus(delivery.status()), reason(delivery.status(), delivery.error())));
            }
            sent += rSent;
            failed += rFailed;
            skipped += rSkipped;
            requestRows.add(new Report.RequestRow(request.id(), time(request.queuedAt()), time(request.completedAt()),
                    requestStatus(request.status()), target(request.id()), rSent, rFailed, rSkipped, deliveries.size(),
                    headline(request.message())));
        }
        var groupRows = groups.entrySet().stream()
                .map(entry -> new Report.GroupRow(entry.getKey(), entry.getValue()[0], entry.getValue()[1]))
                .sorted(Comparator.comparing(Report.GroupRow::group, String.CASE_INSENSITIVE_ORDER))
                .toList();
        var summary = new Report.Summary(list.size(), deliveryRows.size(), sent, failed, skipped, pending, reached.size());
        return new Report(title, scope, LocalDateTime.now(clock), summary, requestRows, deliveryRows, groupRows, message);
    }

    private List<Delivery> deliveries(String requestId) {
        return jdbc.sql("""
                        select d.group_jid, g.name, d.status, d.error, d.updated_at
                        from delivery d left join wa_group g on g.jid = d.group_jid
                        where d.request_id = ? order by d.position""")
                .param(requestId)
                .query((rs, n) -> new Delivery(rs.getString("group_jid"), rs.getString("name"),
                        DeliveryStatus.valueOf(rs.getString("status")), rs.getString("error"), rs.getObject("updated_at", Instant.class)))
                .list();
    }

    private String target(String requestId) {
        if (!requests.isTargeted(requestId)) {
            return "все группы рассылки";
        }
        var count = requests.targets(requestId).size();
        return "выбранные группы: " + count;
    }

    private LocalDateTime time(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, clock.getZone());
    }

    /** The customer sees group names; a group without one gets the tail of its number so rows stay distinguishable. */
    static String groupName(Delivery delivery) {
        if (delivery.name() != null && !delivery.name().isBlank()) {
            return delivery.name().strip();
        }
        var digits = delivery.groupJid().replaceAll("\\D", "");
        return "Группа без названия (…" + digits.substring(Math.max(0, digits.length() - 4)) + ")";
    }

    /** The first meaningful line of the message, without WhatsApp formatting marks. */
    static String headline(String message) {
        if (message == null) {
            return "";
        }
        return message.lines().map(line -> line.replaceAll("[*_~]", "").strip()).filter(line -> !line.isEmpty())
                .findFirst().orElse("");
    }

    static String requestStatus(RequestStatus status) {
        return switch (status) {
            case QUEUED -> "в очереди";
            case SENDING -> "отправляется";
            case DONE -> "завершена";
            case FAILED -> "не отправлена";
        };
    }

    static String deliveryStatus(DeliveryStatus status) {
        return switch (status) {
            case SENT -> "отправлено";
            case FAILED -> "ошибка";
            case SKIPPED -> "пропущено";
            case PENDING -> "в очереди";
            case SENDING -> "отправляется";
        };
    }

    /** A reason in the customer's words; null when there is nothing to explain. */
    static String reason(DeliveryStatus status, String error) {
        if (status == DeliveryStatus.SKIPPED) {
            return "группа исключена из рассылки (номер не может в неё писать)";
        }
        if (status == DeliveryStatus.PENDING && error != null) {
            return "WhatsApp отклонил сообщение, ждёт повтора";
        }
        if (status != DeliveryStatus.FAILED) {
            return null;
        }
        var text = error == null ? "" : error.toLowerCase(Locale.ROOT);
        if (text.contains("479")) {
            return "WhatsApp не принимает рассылку в группы такого размера";
        }
        if (text.contains("420")) {
            return "в сообщество писать нельзя, только в его группу объявлений";
        }
        if (text.contains("server returned error")) {
            return "WhatsApp отклонил сообщение";
        }
        if (text.contains("not participating") || text.contains("forbidden") || text.contains("403") || text.contains("not-authorized")) {
            return "номер больше не состоит в группе";
        }
        if (text.contains("does not exist") || text.contains("404") || text.contains("item-not-found") || text.contains("gone")) {
            return "группа удалена";
        }
        if (text.contains("not-acceptable") || text.contains("406")) {
            return "писать в группу могут только администраторы";
        }
        if (text.contains("timeout") || text.contains("timed out")) {
            return "WhatsApp не ответил вовремя";
        }
        if (text.contains("not connected")) {
            return "нет подключения к WhatsApp";
        }
        return "ошибка отправки";
    }

    record Delivery(String groupJid, String name, DeliveryStatus status, String error, Instant updatedAt) {
    }
}
