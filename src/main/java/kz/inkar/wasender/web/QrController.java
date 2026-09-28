package kz.inkar.wasender.web;

import kz.inkar.wasender.whatsapp.QrService;
import kz.inkar.wasender.whatsapp.WhatsAppGateway;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class QrController {

    private final QrService qr;
    private final WhatsAppGateway gateway;

    public QrController(QrService qr, WhatsAppGateway gateway) {
        this.qr = qr;
        this.gateway = gateway;
    }

    @GetMapping("/api/qr")
    public ResponseEntity<?> qr() {
        return qr.currentPng()
                .<ResponseEntity<?>>map(png -> ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(png))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("message", "QR code is not available", "session", gateway.sessionState().name())));
    }
}
