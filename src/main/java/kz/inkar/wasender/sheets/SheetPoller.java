package kz.inkar.wasender.sheets;

import kz.inkar.wasender.config.SheetsProperties;
import kz.inkar.wasender.notify.AlertService;
import kz.inkar.wasender.request.RequestIdGenerator;
import kz.inkar.wasender.request.RequestRepository;
import kz.inkar.wasender.request.RequestStatus;
import kz.inkar.wasender.request.RequestValidator;
import kz.inkar.wasender.template.TemplateRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class SheetPoller {

    private static final Logger log = LoggerFactory.getLogger(SheetPoller.class);

    private final RequestSource source;
    private final RequestRepository requests;
    private final RequestValidator validator;
    private final RequestIdGenerator ids;
    private final TemplateRenderer renderer;
    private final AlertService alerts;
    private final SheetsProperties properties;
    private final Clock clock;
    private int failures;

    public SheetPoller(RequestSource source, RequestRepository requests, RequestValidator validator, RequestIdGenerator ids,
                       TemplateRenderer renderer, AlertService alerts, SheetsProperties properties, Clock clock) {
        this.source = source;
        this.requests = requests;
        this.validator = validator;
        this.ids = ids;
        this.renderer = renderer;
        this.alerts = alerts;
        this.properties = properties;
        this.clock = clock;
    }

    public synchronized int poll() {
        List<SheetRow> rows;
        try {
            rows = source.readRows();
            failures = 0;
        } catch (RuntimeException e) {
            failures++;
            log.error("SHEETS read failed ({} in a row): {}", failures, e.getMessage());
            if (failures == properties.alertAfterFailures()) {
                alerts.alert("sheets-failed", "Не удаётся прочитать Google Sheets " + failures + " раз подряд: " + e.getMessage());
            }
            return 0;
        }
        var queued = 0;
        var writes = new ArrayList<CellWrite>();
        for (var row : rows) {
            try {
                queued += handle(row, writes) ? 1 : 0;
            } catch (RuntimeException e) {
                log.error("SHEETS row {} skipped this poll: {}", row.rowNumber(), e.getMessage());
            }
        }
        try {
            source.write(writes);
        } catch (RuntimeException e) {
            log.error("SHEETS status write failed, will be restored on next poll: {}", e.getMessage());
        }
        return queued;
    }

    private boolean handle(SheetRow row, List<CellWrite> writes) {
        var id = row.get(SheetField.ID);
        var known = id.isBlank() ? null : requests.find(id).orElse(null);
        if (known != null && row.isBlank(SheetField.STATUS)) {
            if (known.sheetRow() != null && known.sheetRow() != row.rowNumber()) {
                log.warn("SHEETS duplicate id={} row={} original_row={}", id, row.rowNumber(), known.sheetRow());
                writes.add(new CellWrite(row.rowNumber(), SheetField.STATUS, RequestStatus.FAILED.sheetText() + ": дубликат ID " + id));
                return false;
            }
            log.info("SHEETS request_id={} already known, restoring status {}", id, known.status());
            writes.add(new CellWrite(row.rowNumber(), SheetField.STATUS, known.sheetStatus()));
            return false;
        }
        if (known != null) {
            if (Objects.equals(known.sheetRow(), row.rowNumber())) {
                return false;
            }
            requests.updateRow(id, row.rowNumber());
            return false;
        }
        if (!row.isBlank(SheetField.STATUS)) {
            return false;
        }
        var missing = validator.missingFields(row);
        if (!missing.isEmpty()) {
            var text = validator.errorText(missing);
            log.warn("SHEETS row={} rejected: {}", row.rowNumber(), text);
            writes.add(new CellWrite(row.rowNumber(), SheetField.STATUS, text));
            return false;
        }
        if (id.isBlank()) {
            id = ids.next();
            source.write(List.of(new CellWrite(row.rowNumber(), SheetField.ID, id)));
            log.info("SHEETS row={} generated request_id={}", row.rowNumber(), id);
        }
        var message = renderer.render(row.with(SheetField.ID, id));
        requests.insert(id, row.rowNumber(), message, Instant.now(clock));
        writes.add(new CellWrite(row.rowNumber(), SheetField.STATUS, RequestStatus.QUEUED.sheetText()));
        log.info("QUEUED request_id={} row={}", id, row.rowNumber());
        return true;
    }
}
