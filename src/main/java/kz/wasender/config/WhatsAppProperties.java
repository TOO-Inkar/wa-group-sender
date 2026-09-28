package kz.wasender.config;

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
        Duration metadataTtl,
        History history) {

    /**
     * How much chat history the phone sends when the device is linked. Only applied at QR pairing.
     * DISCARD skips the chat list, so quiet (e.g. archived) groups and the archive flag may never arrive.
     */
    public enum History {
        DISCARD,
        STANDARD
    }
}
