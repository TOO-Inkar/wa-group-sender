package kz.wasender.config;

import kz.wasender.sheets.SheetField;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

@ConfigurationProperties("app.sheets")
public record SheetsProperties(
        boolean enabled,
        String spreadsheetId,
        String sheetName,
        Path credentialsPath,
        Duration pollInterval,
        int headerRow,
        Columns columns,
        Duration progressFlushInterval,
        Retry retry,
        int alertAfterFailures,
        String completedFormat) {
    public record Columns(
            String id,
            String route,
            String date,
            String vehicles,
            String cargo,
            String freight,
            String conditions,
            String status,
            String progress,
            String completed) {
        public String header(SheetField field) {
            return switch (field) {
                case ID -> id;
                case ROUTE -> route;
                case DATE -> date;
                case VEHICLES -> vehicles;
                case CARGO -> cargo;
                case FREIGHT -> freight;
                case CONDITIONS -> conditions;
                case STATUS -> status;
                case PROGRESS -> progress;
                case COMPLETED -> completed;
            };
        }
    }

    public record Retry(int maxAttempts, Duration initialBackoff, Duration maxBackoff) {
    }
}
