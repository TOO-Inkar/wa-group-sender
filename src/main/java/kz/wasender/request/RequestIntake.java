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
import java.util.ArrayList;
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
    private static final int MAX_TEXT = 20_000;

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
        return create(new Draft(List.of(fields), null, null), targetGroups);
    }

    @Transactional
    public synchronized RequestRecord create(Draft draft, Collection<String> targetGroups) {
        var rows = validate(draft);
        var targets = new LinkedHashSet<>(targetGroups == null ? List.<String>of() : targetGroups);
        var unavailable = targets.stream().filter(jid -> !groups.isSendable(jid)).toList();
        if (!unavailable.isEmpty()) {
            throw new RejectedException("в эти группы писать нельзя (номер не участник или пишут только админы): " + String.join(", ", unavailable));
        }
        var id = ids.next(List.of());
        requests.insert(id, message(draft, rows, id), Instant.now(clock), targets);
        log.info("QUEUED request_id={} source=web kind={} targets={}", id, draft.isText() ? "text" : rows.size() + "-items",
                targets.isEmpty() ? "all-active" : targets.size());
        return requests.find(id).orElseThrow();
    }

    public String preview(Map<SheetField, String> fields) {
        return renderer.render(row(fields));
    }

    /** The message as it will be sent, without checking that the fields are filled in. */
    public String preview(Draft draft) {
        if (draft.isText()) {
            return text(draft.text());
        }
        var rows = draft.items().stream().map(RequestIntake::row).filter(row -> !row.isEmpty()).toList();
        return rows.isEmpty() ? "" : message(draft, rows, null);
    }

    private List<SheetRow> validate(Draft draft) {
        if (draft.isText()) {
            if (text(draft.text()).length() > MAX_TEXT) {
                throw new RejectedException("текст длиннее " + MAX_TEXT + " символов");
            }
            return List.of();
        }
        var rows = draft.items().stream().map(RequestIntake::row).filter(row -> !row.isEmpty()).toList();
        if (rows.isEmpty()) {
            throw new RejectedException("заявка пустая: заполните поля или вставьте готовый текст");
        }
        var problems = new ArrayList<String>();
        for (var i = 0; i < rows.size(); i++) {
            var missing = validator.missingFields(rows.get(i));
            if (!missing.isEmpty()) {
                var fields = String.join(", ", missing.stream().map(SheetField::title).toList());
                problems.add(rows.size() == 1 ? "не заполнено: " + fields : "заявка " + (i + 1) + " — не заполнено: " + fields);
            }
        }
        if (!problems.isEmpty()) {
            throw new RejectedException(String.join("; ", problems));
        }
        return rows;
    }

    // One request keeps the old shape (numbered by its ID when MESSAGE_NUMBERING is on);
    // several are numbered by position, separated, with the contact once at the end.
    private String message(Draft draft, List<SheetRow> rows, String id) {
        if (draft.isText()) {
            return text(draft.text());
        }
        if (rows.size() == 1) {
            var row = id == null ? rows.getFirst() : rows.getFirst().with(SheetField.ID, id);
            return renderer.render(row, draft.contact());
        }
        return renderer.renderCombined(rows, draft.contact());
    }

    private static String text(String text) {
        return text.replace("\r\n", "\n").replace('\r', '\n').strip();
    }

    /**
     * What the admin page sends: several requests to combine into one message, or a ready text sent as is.
     * contact replaces MESSAGE_CONTACT for this message when not blank.
     */
    public record Draft(List<Map<SheetField, String>> items, String text, String contact) {

        public Draft {
            items = items == null ? List.of() : items;
        }

        public boolean isText() {
            return text != null && !text.isBlank();
        }
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
