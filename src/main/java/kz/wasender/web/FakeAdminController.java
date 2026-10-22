package kz.wasender.web;

import kz.wasender.sheets.SheetRow;
import kz.wasender.sheets.fake.FakeRequestSource;
import kz.wasender.template.PreviewService;
import kz.wasender.whatsapp.fake.FakeWhatsAppGateway;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@Profile("fake")
@RequestMapping("/api/admin/fake")
public class FakeAdminController {
    private final FakeRequestSource source;
    private final FakeWhatsAppGateway gateway;
    private final PreviewService preview;

    public FakeAdminController(FakeRequestSource source, FakeWhatsAppGateway gateway, PreviewService preview) {
        this.source = source;
        this.gateway = gateway;
        this.preview = preview;
    }

    @PostMapping("/requests")
    public Map<String, Object> add(@RequestBody Map<String, String> fields) {
        return Map.of("row", source.addRow(preview.fields(fields)));
    }

    @GetMapping("/sheet")
    public List<SheetRow> sheet() {
        return source.rows();
    }

    @GetMapping("/sent")
    public List<FakeWhatsAppGateway.SentMessage> sent() {
        return gateway.sent();
    }
}
