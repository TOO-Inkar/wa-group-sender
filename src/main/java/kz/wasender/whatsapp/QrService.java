package kz.wasender.whatsapp;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import kz.wasender.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Map;
import java.util.Optional;

@Service
public class QrService {

    private static final Logger log = LoggerFactory.getLogger(QrService.class);

    private final WhatsAppGateway gateway;
    private final WhatsAppProperties properties;

    public QrService(WhatsAppGateway gateway, WhatsAppProperties properties) {
        this.gateway = gateway;
        this.properties = properties;
        gateway.subscribe(this::onEvent);
    }

    public Optional<byte[]> currentPng() {
        return gateway.currentQr().map(this::png);
    }

    public String ascii(String payload) {
        var matrix = matrix(payload, 0, 2);
        var builder = new StringBuilder();
        for (var y = 0; y < matrix.getHeight(); y += 2) {
            for (var x = 0; x < matrix.getWidth(); x++) {
                var top = !matrix.get(x, y);
                var bottom = y + 1 < matrix.getHeight() && !matrix.get(x, y + 1);
                builder.append(top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ');
            }
            builder.append('\n');
        }
        return builder.toString();
    }

    private void onEvent(GatewayEvent event) {
        switch (event) {
            case GatewayEvent.QrReceived received -> {
                writePng(received.payload());
                log.warn("QR code for pairing (WhatsApp -> Связанные устройства -> Привязка устройства). PNG: {} or GET /api/qr\n{}",
                        properties.qrPngPath(), ascii(received.payload()));
            }
            case GatewayEvent.Connected ignored -> deletePng();
            default -> {
            }
        }
    }

    private void writePng(String payload) {
        try {
            Files.createDirectories(properties.qrPngPath().toAbsolutePath().getParent());
            Files.write(properties.qrPngPath(), png(payload));
        } catch (IOException e) {
            log.error("Cannot write QR png {}", properties.qrPngPath(), e);
        }
    }

    private void deletePng() {
        try {
            Files.deleteIfExists(properties.qrPngPath());
        } catch (IOException e) {
            log.warn("Cannot delete QR png {}", properties.qrPngPath(), e);
        }
    }

    private byte[] png(String payload) {
        try (var output = new ByteArrayOutputStream()) {
            MatrixToImageWriter.writeToStream(matrix(payload, 400, 2), "PNG", output);
            return output.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private BitMatrix matrix(String payload, int size, int margin) {
        try {
            return new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, Map.of(EncodeHintType.MARGIN, margin));
        } catch (WriterException e) {
            throw new IllegalStateException(e);
        }
    }
}
