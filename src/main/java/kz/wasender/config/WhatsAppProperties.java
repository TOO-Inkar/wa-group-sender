package kz.wasender.config;

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
}
