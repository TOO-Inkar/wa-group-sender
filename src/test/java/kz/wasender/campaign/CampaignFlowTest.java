package kz.wasender.campaign;

import kz.wasender.dispatch.DeliveryStatus;
import kz.wasender.dispatch.DispatcherState;
import kz.wasender.request.RequestIntake;
import kz.wasender.request.RequestStatus;
import kz.wasender.settings.SettingsService;
import kz.wasender.sheets.SheetField;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.EnumMap;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CampaignFlowTest extends IntegrationTest {

    @Autowired
    CampaignService campaigns;
    @Autowired
    CampaignRepository repository;
    @Autowired
    SettingsService settings;

    private static RequestIntake.Draft draft(String route) {
        var fields = new EnumMap<SheetField, String>(SheetField.class);
        fields.put(SheetField.ROUTE, route);
        fields.put(SheetField.DATE, "Срочно");
        fields.put(SheetField.VEHICLES, "Тент 20 т");
        fields.put(SheetField.CARGO, "Мука");
        fields.put(SheetField.FREIGHT, "🔥");
        return new RequestIntake.Draft(List.of(fields), null, null);
    }

    private CampaignRecord create(String route, Schedule schedule, boolean sendNow) {
        return campaigns.create(new CampaignService.Input(draft(route), "{}", null, null, null, schedule, sendNow));
    }

    @Test
    void dailyCampaignStartsAtItsOwnTimeBeforeTheCommonWindow() throws Exception {
        useGroups(3);
        var campaign = create("АЛМАТЫ → АСТАНА", new Schedule(RepeatMode.DAILY, LocalTime.of(5, 0), null, null), false);
        assertThat(campaign.title()).isEqualTo("АЛМАТЫ → АСТАНА");
        assertThat(campaign.nextRunAt()).isEqualTo(LocalDateTime.of(2026, 9, 29, 5, 0).atZone(clock.getZone()).toInstant());
        assertThat(campaigns.tick()).isZero();

        clock.set(LocalDateTime.of(2026, 9, 29, 5, 0, 10));
        assertThat(campaigns.tick()).isEqualTo(1);
        runUntilBlocked(100);

        // Общее окно с 08:00, но у заявки своё — с 05:00.
        assertThat(sentJids()).hasSize(3);
        var run = requests.findByCampaign(campaign.id()).getFirst();
        assertThat(run.status()).isEqualTo(RequestStatus.DONE);
        assertThat(run.windowStart()).isEqualTo(LocalTime.of(5, 0));
        assertThat(repository.find(campaign.id()).orElseThrow().nextRunAt())
                .isEqualTo(LocalDateTime.of(2026, 9, 30, 5, 0).atZone(clock.getZone()).toInstant());
    }

    @Test
    void intervalOccurrenceIsSkippedWhileThePreviousRunIsStillSending() throws Exception {
        useGroups(40);
        var campaign = create("ХОРГОС → БАКУ", new Schedule(RepeatMode.INTERVAL, LocalTime.of(8, 0), LocalTime.of(20, 0), 60), true);
        assertThat(requests.findByCampaign(campaign.id())).hasSize(1);

        dispatcher.cycle();
        clock.advance(Duration.ofMinutes(31));
        assertThat(campaigns.tick()).as("10:30 ещё не время").isZero();
        clock.set(LocalDateTime.of(2026, 9, 28, 11, 0, 5));
        assertThat(campaigns.tick()).as("прошлая рассылка ещё идёт").isZero();
        assertThat(requests.findByCampaign(campaign.id())).hasSize(1);
        assertThat(repository.find(campaign.id()).orElseThrow().nextRunAt())
                .isEqualTo(LocalDateTime.of(2026, 9, 28, 12, 0).atZone(clock.getZone()).toInstant());
    }

    @Test
    void yesterdaysUnfinishedRunIsClosedWhenTheNextDayStarts() throws Exception {
        useGroups(40);
        var campaign = create("КАЛЖАТ → БАКУ", new Schedule(RepeatMode.DAILY, LocalTime.of(9, 0), null, null), true);
        dispatcher.cycle();
        var first = requests.findByCampaign(campaign.id()).getFirst();

        clock.set(LocalDateTime.of(2026, 9, 29, 9, 0, 5));
        assertThat(campaigns.tick()).isEqualTo(1);

        var runs = requests.findByCampaign(campaign.id());
        assertThat(runs).hasSize(2);
        var closed = requests.find(first.id()).orElseThrow();
        assertThat(closed.status()).isEqualTo(RequestStatus.DONE);
        assertThat(deliveries.findByRequest(first.id())).filteredOn(d -> d.status() == DeliveryStatus.SKIPPED)
                .hasSize(39).allMatch(d -> d.error().contains("устарела"));
    }

    @Test
    void severalCampaignsShareTheHourlyLimitOfTheNumber() throws Exception {
        useGroups(10);
        settings.update(new SettingsService.View(null, null, null, 6, null, null, null, null, null, null, null, null,
                null, null, null, null, null));
        create("Первая", new Schedule(RepeatMode.ONCE, null, null, null), true);
        create("Вторая", new Schedule(RepeatMode.ONCE, null, null, null), true);

        runUntilBlocked(200);

        assertThat(dispatcher.state()).isEqualTo(DispatcherState.HOURLY_LIMIT_REACHED);
        assertThat(gateway.sent()).hasSize(6);
        assertThat(gateway.sent()).filteredOn(m -> m.text().contains("Первая")).hasSize(3);
        assertThat(gateway.sent()).filteredOn(m -> m.text().contains("Вторая")).hasSize(3);

        clock.advance(Duration.ofMinutes(61));
        runUntilBlocked(200);
        assertThat(gateway.sent()).hasSize(12);
    }

    @Test
    void groupWhereOurMessageIsLastWaitsUntilTheGapPasses() throws Exception {
        useGroups(2);
        settings.update(new SettingsService.View(null, null, null, null, null, null, null, null, null, null, null, 30,
                null, null, null, null, null));
        var first = create("Первая", new Schedule(RepeatMode.ONCE, null, null, null), true);
        runUntilBlocked(200);
        assertThat(gateway.sent()).hasSize(2);

        var groupsJids = sentJids();
        gateway.simulateForeignMessage(groupsJids.get(0));
        create("Вторая", new Schedule(RepeatMode.ONCE, null, null, null), true);
        runUntilBlocked(200);

        // В первой группе после нас кто-то написал — шлём; во второй последнее сообщение наше — ждём.
        assertThat(gateway.sent()).hasSize(3);
        assertThat(gateway.sent().get(2).groupJid()).isEqualTo(groupsJids.get(0));
        for (var i = 0; i < 5; i++) {
            dispatcher.cycle();
        }
        assertThat(dispatcher.state()).isEqualTo(DispatcherState.WAITING_GROUPS);

        clock.advance(Duration.ofMinutes(31));
        runUntilBlocked(200);
        assertThat(gateway.sent()).hasSize(4);
        assertThat(gateway.sent().get(3).groupJid()).isEqualTo(groupsJids.get(1));
        assertThat(requests.findByCampaign(first.id()).getFirst().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void editingChangesTheTextOfTheRunNotStartedYetAndDeletingStopsIt() throws Exception {
        useGroups(30);
        var campaign = create("Старый текст", new Schedule(RepeatMode.ONCE, LocalTime.of(15, 0), null, null), false);
        assertThat(requests.findByCampaign(campaign.id())).isEmpty();

        campaigns.update(campaign.id(), new CampaignService.Input(draft("Новый текст"), "{}", null, "Своё название", null,
                new Schedule(RepeatMode.ONCE, LocalTime.of(15, 0), null, null), false));
        clock.set(LocalDateTime.of(2026, 9, 28, 15, 0, 1));
        campaigns.tick();
        dispatcher.cycle();
        assertThat(gateway.sent()).singleElement().satisfies(m -> assertThat(m.text()).contains("Новый текст"));
        assertThat(repository.find(campaign.id()).orElseThrow().title()).isEqualTo("Своё название");

        campaigns.delete(campaign.id());
        runUntilBlocked(200);
        assertThat(gateway.sent()).hasSize(1);
        assertThat(repository.find(campaign.id())).isEmpty();
        assertThat(requests.findByCampaign(campaign.id()).getFirst().status()).isEqualTo(RequestStatus.DONE);
    }

    @Autowired
    kz.wasender.web.CampaignController controller;
    @Autowired
    kz.wasender.group.GroupListRepository groupLists;

    @Test
    void recipientsWithoutAStoredLabelAreShownByTheMatchingListName() {
        useGroups(3);
        var jids = groups().subList(0, 2);
        groupLists.save("Тест", jids, clock.instant());
        var campaign = campaigns.create(new CampaignService.Input(draft("Старая заявка"), "{}", jids, null, null,
                new Schedule(RepeatMode.ONCE, null, null, null), false));
        assertThat(campaign.targetLabel()).isNotEqualTo("Тест");

        repository.update(new CampaignRecord(campaign.id(), campaign.title(), campaign.draft(), campaign.message(), true, null,
                campaign.schedule(), campaign.enabled(), false, campaign.createdAt(), campaign.updatedAt(), campaign.nextRunAt(),
                campaign.lastRunAt()), jids);

        assertThat(controller.list()).singleElement().satisfies(view -> assertThat(view.targetLabel()).isEqualTo("Тест"));
    }

    private List<String> groups() {
        return gateway.listGroups().stream().map(kz.wasender.whatsapp.GroupInfo::jid).sorted().toList();
    }

    @Test
    void runNowIsRefusedWhileTheCampaignIsStillSending() {
        useGroups(5);
        var campaign = create("Повтор", new Schedule(RepeatMode.ONCE, null, null, null), true);

        assertThatThrownBy(() -> campaigns.runNow(campaign.id())).isInstanceOf(CampaignService.ConflictException.class);
    }
}
