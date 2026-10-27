package kz.wasender.config;

import kz.wasender.engine.TenantInfo;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

@ConfigurationProperties("app.whatsapp")
public record WhatsAppProperties(
        URI bridgeUrl,
        Path qrPngPath,
        Duration sendTimeout,
        Duration groupsTimeout,
        Path pictureDir,
        Duration pictureTtl) {
    private static final String SESSION_PATH = "/s/";

    public WhatsAppProperties forTenant(TenantInfo tenant) {
        return new WhatsAppProperties(URI.create(bridgeUrl.toString().replaceAll("/+$", "") + SESSION_PATH + tenant.key()),
                tenant.file(qrPngPath), sendTimeout, groupsTimeout, tenant.dir(pictureDir), pictureTtl);
    }
}
