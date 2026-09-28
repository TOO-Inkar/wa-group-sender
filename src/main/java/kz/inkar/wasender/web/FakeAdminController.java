package kz.inkar.wasender.web;

import kz.inkar.wasender.sheets.SheetRow;
import kz.inkar.wasender.sheets.fake.FakeRequestSource;
import kz.inkar.wasender.whatsapp.fake.FakeWhatsAppGateway;
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

    public FakeAdminController(FakeRequestSource source, FakeWhatsAppGateway gateway) {
        this.source = source;
        this.gateway = gateway;
    }

    @PostMapping("/requests")
    public Map<String, Object> add(@RequestBody NewRow row) {
        var number = source.addRow(value(row.id()), value(row.route()), value(row.tonnage()), value(row.cargo()), value(row.date()), value(row.freight()));
        return Map.of("row", number);
    }

    @GetMapping("/sheet")
    public List<SheetRow> sheet() {
        return source.rows();
    }

    @GetMapping("/sent")
    public List<FakeWhatsAppGateway.SentMessage> sent() {
        return gateway.sent();
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    public record NewRow(String id, String route, String tonnage, String cargo, String date, String freight) {
    }
}
