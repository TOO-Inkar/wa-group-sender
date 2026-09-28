package kz.wasender.sheets;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import kz.wasender.config.SheetsProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;

@Component
@Profile("!fake")
public class GoogleSheetsRequestSource implements RequestSource {

    private final SheetsProperties properties;
    private final ColumnLayout layout;
    private final SheetsRetry retry;
    private volatile Sheets sheets;

    public GoogleSheetsRequestSource(SheetsProperties properties, SheetsRetry retry) {
        this.properties = properties;
        this.layout = new ColumnLayout(properties.columns());
        this.retry = retry;
    }

    @Override
    public List<SheetRow> readRows() {
        var range = sheetPrefix() + "A" + properties.firstDataRow() + ":" + layout.lastLetter();
        var response = retry.call("read", () -> client().spreadsheets().values()
                .get(properties.spreadsheetId(), range)
                .setValueRenderOption("FORMATTED_VALUE")
                .execute());
        var values = response.getValues() == null ? List.<List<Object>>of() : response.getValues();
        var rows = new ArrayList<SheetRow>();
        for (var i = 0; i < values.size(); i++) {
            var cells = values.get(i);
            var map = new EnumMap<SheetField, String>(SheetField.class);
            for (var field : SheetField.values()) {
                var index = layout.index(field);
                map.put(field, index < cells.size() && cells.get(index) != null ? cells.get(index).toString() : "");
            }
            var row = new SheetRow(properties.firstDataRow() + i, map);
            if (!row.isEmpty()) {
                rows.add(row);
            }
        }
        return rows;
    }

    @Override
    public void write(List<CellWrite> writes) {
        if (writes.isEmpty()) {
            return;
        }
        var data = writes.stream()
                .map(write -> new ValueRange()
                        .setRange(sheetPrefix() + layout.letter(write.field()) + write.rowNumber())
                        .setValues(List.of(List.of(write.value()))))
                .toList();
        var body = new BatchUpdateValuesRequest().setValueInputOption("RAW").setData(data);
        retry.call("write", () -> client().spreadsheets().values().batchUpdate(properties.spreadsheetId(), body).execute());
    }

    private String sheetPrefix() {
        return "'" + properties.sheetName().replace("'", "''") + "'!";
    }

    private Sheets client() throws Exception {
        var current = sheets;
        if (current == null) {
            synchronized (this) {
                if (sheets == null) {
                    GoogleCredentials credentials;
                    try (var input = Files.newInputStream(properties.credentialsPath())) {
                        credentials = GoogleCredentials.fromStream(input).createScoped(List.of(SheetsScopes.SPREADSHEETS));
                    }
                    sheets = new Sheets.Builder(GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance(),
                            new HttpCredentialsAdapter(credentials))
                            .setApplicationName("wa-group-sender")
                            .build();
                }
                current = sheets;
            }
        }
        return current;
    }
}
