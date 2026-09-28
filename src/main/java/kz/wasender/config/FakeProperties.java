package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.fake")
public record FakeProperties(int groups, int unarchivedGroups, int adminOnlyGroups, double failureRate, String sheetCsv) {
}
