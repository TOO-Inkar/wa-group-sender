package kz.wasender.spike;

import it.auties.whatsapp.api.QrHandler;
import it.auties.whatsapp.api.WebHistorySetting;
import it.auties.whatsapp.api.Whatsapp;
import it.auties.whatsapp.controller.ControllerSerializer;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("spike")
class CobaltSpikeTest {

    @TempDir
    Path sessionDir;

    @Test
    void receivesQrFromWhatsAppWebWithoutBrowser() throws Exception {
        var qr = new CompletableFuture<String>();
        var whatsapp = Whatsapp.webBuilder()
                .serializer(ControllerSerializer.toProtobuf(sessionDir))
                .lastConnection()
                .name("wa-group-sender-spike")
                .historySetting(WebHistorySetting.discard(false))
                .unregistered(QrHandler.toPlainString(qr::complete));
        whatsapp.connect();
        var code = qr.get(90, TimeUnit.SECONDS);
        System.out.println("SPIKE QR payload length=" + code.length() + " commas=" + code.chars().filter(c -> c == 44).count());
        assertThat(code).isNotBlank();
        whatsapp.disconnect().get(30, TimeUnit.SECONDS);
        try (var files = java.nio.file.Files.walk(sessionDir)) {
            System.out.println("SPIKE session files=" + files.filter(java.nio.file.Files::isRegularFile).count());
        }
    }
}
