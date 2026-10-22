package kz.wasender.sheets;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.ServiceAccountCredentials;
import kz.wasender.config.SheetsProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.util.List;

@Component
@Profile("!fake")
public class GoogleSheetsRequestSource implements RequestSource {
    private final SheetsProperties properties;
    private final SheetsRetry retry;
    private volatile Sheets sheets;
    private volatile ColumnLayout layout;

    public GoogleSheetsRequestSource(SheetsProperties properties, SheetsRetry retry) {
        this.properties = properties;
        this.retry = retry;
    }

    @Override
    public List<SheetRow> readRows() {
        var response = retry.call("read", () -> client().spreadsheets().values()
                .get(properties.spreadsheetId(), sheetRange())
                .setValueRenderOption("FORMATTED_VALUE")
                .execute());
        var values = response.getValues() == null ? List.<List<Object>>of() : response.getValues();
        var header = values.size() >= properties.headerRow() ? values.get(properties.headerRow() - 1) : List.of();
        var current = new ColumnLayout(properties.columns(), header).requireComplete();
        layout = current;
        return current.rows(values, properties.headerRow());
    }

    @Override
    public void write(List<CellWrite> writes) {
        if (writes.isEmpty()) {
            return;
        }
        var current = layout == null ? readLayout().requireComplete() : layout;
        var data = writes.stream()
                .map(write -> new ValueRange()
                        .setRange(sheetPrefix() + current.letter(write.field()) + write.rowNumber())
                        .setValues(List.of(List.of(write.value()))))
                .toList();
        var body = new BatchUpdateValuesRequest().setValueInputOption("RAW").setData(data);
        retry.call("write", () -> client().spreadsheets().values().batchUpdate(properties.spreadsheetId(), body).execute());
    }

    @Override
    public List<String> missingHeaders() {
        return readLayout().missing();
    }

    private ColumnLayout readLayout() {
        var row = properties.headerRow();
        var response = retry.call("read header", () -> client().spreadsheets().values()
                .get(properties.spreadsheetId(), sheetPrefix() + row + ":" + row)
                .execute());
        var values = response.getValues();
        var current = new ColumnLayout(properties.columns(), values == null || values.isEmpty() ? List.of() : values.getFirst());
        if (current.missing().isEmpty()) {
            layout = current;
        }
        return current;
    }

    private String sheetRange() {
        return "'" + properties.sheetName().replace("'", "''") + "'";
    }

    private String sheetPrefix() {
        return sheetRange() + "!";
    }

    private Sheets client() throws Exception {
        var current = sheets;
        if (current == null) {
            synchronized (this) {
                if (sheets == null) {
                    ServiceAccountCredentials credentials;
                    try (var input = Files.newInputStream(properties.credentialsPath())) {
                        credentials = ServiceAccountCredentials.fromStream(input);
                    }
                    sheets = new Sheets.Builder(GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance(),
                            new HttpCredentialsAdapter(credentials.createScoped(List.of(SheetsScopes.SPREADSHEETS))))
                            .setApplicationName("wa-group-sender")
                            .build();
                }
                current = sheets;
            }
        }
        return current;
    }
}
