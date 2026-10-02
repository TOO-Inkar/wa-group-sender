package kz.wasender.request;

import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import kz.wasender.template.TemplateRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
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
    private final Clock clock;

    public RequestIntake(RequestRepository requests, RequestValidator validator, RequestIdGenerator ids, TemplateRenderer renderer, Clock clock) {
        this.requests = requests;
        this.validator = validator;
        this.ids = ids;
        this.renderer = renderer;
        this.clock = clock;
    }

    public synchronized RequestRecord create(Map<SheetField, String> fields) {
        var row = row(fields);
        var missing = validator.missingFields(row);
        if (!missing.isEmpty()) {
            throw new MissingFieldsException(missing);
        }
        var id = ids.next(List.of());
        requests.insert(id, renderer.render(row.with(SheetField.ID, id)), Instant.now(clock));
        log.info("QUEUED request_id={} source=web", id);
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

    public static class MissingFieldsException extends RuntimeException {

        private final List<SheetField> missing;

        public MissingFieldsException(List<SheetField> missing) {
            super("не заполнено: " + String.join(", ", missing.stream().map(SheetField::title).toList()));
            this.missing = List.copyOf(missing);
        }

        public List<SheetField> missing() {
            return missing;
        }
    }
}
