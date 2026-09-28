package kz.inkar.wasender.config;

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
        int firstDataRow,
        Columns columns,
        Duration progressFlushInterval,
        Retry retry,
        int alertAfterFailures,
        String completedFormat) {

    public record Columns(
            String id,
            String route,
            String tonnage,
            String cargo,
            String date,
            String freight,
            String status,
            String progress,
            String completed) {
    }

    public record Retry(int maxAttempts, Duration initialBackoff, Duration maxBackoff) {
    }
}
