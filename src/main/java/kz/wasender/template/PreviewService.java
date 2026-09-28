package kz.wasender.template;

import kz.wasender.config.SheetsProperties;
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

    public PreviewService(RequestSource source, TemplateRenderer renderer, SheetsProperties sheets) {
        this.source = source;
        this.renderer = renderer;
        this.columns = sheets.columns();
    }

    public Optional<String> byId(String id) {
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
