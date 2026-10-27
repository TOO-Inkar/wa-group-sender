package kz.wasender.config;

import kz.wasender.engine.TenantInfo;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties("app.fake")
public record FakeProperties(int groups, int unarchivedGroups, int adminOnlyGroups, double failureRate, String sheetCsv, String sheetState) {
    public FakeProperties forTenant(TenantInfo tenant) {
        var state = sheetState == null || sheetState.isBlank() ? sheetState : tenant.file(Path.of(sheetState)).toString();
        return new FakeProperties(groups, unarchivedGroups, adminOnlyGroups, failureRate, sheetCsv, state);
    }
}
