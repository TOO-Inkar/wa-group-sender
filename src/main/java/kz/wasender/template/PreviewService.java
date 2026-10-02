package kz.wasender.template;

import kz.wasender.config.SheetsProperties;
import kz.wasender.request.RequestRecord;
import kz.wasender.request.RequestRepository;
import kz.wasender.sheets.ColumnLayout;
import kz.wasender.sheets.RequestSource;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;

@Service
public class PreviewService {

    private final RequestSource source;
    private final TemplateRenderer renderer;
    private final SheetsProperties.Columns columns;
    private final RequestRepository requests;
    private final boolean sheetsEnabled;

    public PreviewService(RequestSource source, TemplateRenderer renderer, SheetsProperties sheets, RequestRepository requests) {
        this.source = source;
        this.renderer = renderer;
        this.columns = sheets.columns();
        this.requests = requests;
        this.sheetsEnabled = sheets.enabled();
    }

    /** The text of a queued or sent request; a sheet row not queued yet is rendered when the sheet is in use. */
    public Optional<String> byId(String id) {
        var stored = requests.find(id.strip()).map(RequestRecord::message);
        if (stored.isPresent() || !sheetsEnabled) {
            return stored;
        }
        return source.readRows().stream()
                .filter(row -> row.get(SheetField.ID).equals(id.strip()))
                .findFirst()
                .map(renderer::render);
    }

    public String byFields(Map<String, String> fields) {
        return renderer.render(new SheetRow(0, fields(fields)));
    }

    public Map<SheetField, String> fields(Map<String, String> fields) {
        var values = new EnumMap<SheetField, String>(SheetField.class);
        fields.forEach((key, value) -> {
            var normalized = ColumnLayout.normalize(key);
            for (var field : SheetField.CONTENT) {
                if (normalized.equals(ColumnLayout.normalize(field.title())) || normalized.equals(ColumnLayout.normalize(columns.header(field)))) {
                    values.put(field, value);
                }
            }
        });
        return values;
    }
}
