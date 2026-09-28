package kz.inkar.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

@ConfigurationProperties("app.whatsapp")
public record WhatsAppProperties(
        Path sessionDir,
        Path qrPngPath,
        String deviceName,
        Duration sendTimeout,
        Duration metadataQueryDelay,
        Duration metadataTtl) {
}
