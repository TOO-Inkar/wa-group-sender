package kz.wasender.request;

import kz.wasender.group.GroupRepository;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import kz.wasender.template.TemplateRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Requests entered in the admin page. They join the same queue as sheet rows; with no sheet row behind them,
 * status and progress stay in the local database only.
 */
@Service
public class RequestIntake {

    private static final Logger log = LoggerFactory.getLogger(RequestIntake.class);

    private final RequestRepository requests;
    private final RequestValidator validator;
    private final RequestIdGenerator ids;
    private final TemplateRenderer renderer;
    private final GroupRepository groups;
    private final Clock clock;

    public RequestIntake(RequestRepository requests, RequestValidator validator, RequestIdGenerator ids, TemplateRenderer renderer,
                         GroupRepository groups, Clock clock) {
        this.groups = groups;
        this.requests = requests;
        this.validator = validator;
        this.ids = ids;
        this.renderer = renderer;
        this.clock = clock;
    }

    /**
     * Queues the request. With target groups it goes only to them, and each must be a group the number can write to
     * (it need not be archived, so a test group works); without targets it goes to every active group.
     */
    @Transactional
    public synchronized RequestRecord create(Map<SheetField, String> fields, Collection<String> targetGroups) {
        var row = row(fields);
        var missing = validator.missingFields(row);
        if (!missing.isEmpty()) {
            throw new RejectedException("не заполнено: " + String.join(", ", missing.stream().map(SheetField::title).toList()));
        }
        var targets = new LinkedHashSet<>(targetGroups == null ? List.<String>of() : targetGroups);
        var unavailable = targets.stream().filter(jid -> !groups.isSendable(jid)).toList();
        if (!unavailable.isEmpty()) {
            throw new RejectedException("в эти группы писать нельзя (номер не участник или пишут только админы): " + String.join(", ", unavailable));
        }
        var id = ids.next(List.of());
        requests.insert(id, renderer.render(row.with(SheetField.ID, id)), Instant.now(clock), targets);
        log.info("QUEUED request_id={} source=web targets={}", id, targets.isEmpty() ? "all-active" : targets.size());
        return requests.find(id).orElseThrow();
    }

    public String preview(Map<SheetField, String> fields) {
        return renderer.render(row(fields));
    }

    private static SheetRow row(Map<SheetField, String> fields) {
        var content = new EnumMap<SheetField, String>(SheetField.class);
        fields.forEach((field, value) -> {
            if (field != SheetField.ID && SheetField.CONTENT.contains(field)) {
                content.put(field, value);
            }
        });
        return new SheetRow(0, content);
    }

    /** The request was not queued; the message says why, in words for the admin page. */
    public static class RejectedException extends RuntimeException {

        public RejectedException(String message) {
            super(message);
        }
    }
}
