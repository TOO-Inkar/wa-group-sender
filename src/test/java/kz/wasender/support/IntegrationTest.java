package kz.wasender.support;

import kz.wasender.dispatch.DeliveryRepository;
import kz.wasender.dispatch.Dispatcher;
import kz.wasender.dispatch.DispatcherState;
import kz.wasender.group.GroupSyncService;
import kz.wasender.request.RequestRepository;
import kz.wasender.risk.RiskMonitor;
import kz.wasender.sheets.SheetPoller;
import kz.wasender.sheets.SheetUpdateBuffer;
import kz.wasender.sheets.fake.FakeRequestSource;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.fake.FakeWhatsAppGateway;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;

@SpringBootTest
@ActiveProfiles({"fake", "test"})
@Import(TestBeans.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public abstract class IntegrationTest {

    @Autowired
    protected MutableClock clock;
    @Autowired
    protected FakeSleeper sleeper;
    @Autowired
    protected RecordingNotifier notifier;
    @Autowired
    protected FakeWhatsAppGateway gateway;
    @Autowired
    protected FakeRequestSource sheet;
    @Autowired
    protected SheetPoller poller;
    @Autowired
    protected SheetUpdateBuffer buffer;
    @Autowired
    protected GroupSyncService groupSync;
    @Autowired
    protected Dispatcher dispatcher;
    @Autowired
    protected RequestRepository requests;
    @Autowired
    protected DeliveryRepository deliveries;
    @Autowired
    protected RiskMonitor risk;

    @BeforeEach
    void connectAndSync() {
        gateway.connect();
    }

    protected void useGroups(int count) {
        var groups = new ArrayList<GroupInfo>();
        for (var i = 1; i <= count; i++) {
            groups.add(new GroupInfo("12036399%06d@g.us".formatted(i), "Группа " + i, true, true, true));
        }
        gateway.replaceGroups(groups);
        groupSync.sync();
    }

    protected int addValidRow(String route) {
        return sheet.addRow("", route, "20 т", "Цемент", "01.10.2026", "500 000 ₸");
    }

    protected int runUntilBlocked(int maxCycles) throws InterruptedException {
        var cycles = 0;
        while (cycles < maxCycles) {
            cycles++;
            dispatcher.cycle();
            var state = dispatcher.state();
            if (state != DispatcherState.RUNNING) {
                break;
            }
        }
        buffer.flush();
        return cycles;
    }

    protected List<String> sentJids() {
        return gateway.sent().stream().map(FakeWhatsAppGateway.SentMessage::groupJid).toList();
    }
}
