package kz.wasender.dispatch;

import kz.wasender.request.RequestStatus;
import kz.wasender.settings.SettingsService;
import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GroupPaceFlowTest extends IntegrationTest {
    private static final int INTERVAL_MINUTES = 60;
    private static final Duration INTERVAL = Duration.ofMinutes(INTERVAL_MINUTES);
    private static final Duration SHORTEST_PACE = INTERVAL.minus(INTERVAL.dividedBy(4));
    private static final Duration REPLY_RECHECK = Duration.ofMinutes(10);
    private static final String GROUP = "12036399000001@g.us";
    private static final String FIRST_TEXT = "АЛМАТЫ → АСТАНА, тент 20 т";
    private static final String SECOND_TEXT = "ШЫМКЕНТ → ТАРАЗ, рефрижератор";

    @Autowired
    SettingsService settings;

    private int queued;

    private void pace(int intervalMinutes, boolean waitForReply) {
        settings.update(new SettingsService.View(null, null, null, null, null, null, null, null, null, null, null, intervalMinutes,
                waitForReply, null, null, null, null, null));
    }

    private String queue(String text) {
        var id = "R" + ++queued;
        requests.insertRun(id, null, text, clock.instant(), List.of(), null, null);
        return id;
    }

    private DeliveryRecord deliveryOf(String requestId) {
        return deliveries.findByRequest(requestId).getFirst();
    }

    @Test
    void sameTextWaitsForTheGroupIntervalMinusUpToAQuarter() throws Exception {
        useGroups(1);
        pace(INTERVAL_MINUTES, false);
        queue(FIRST_TEXT);
        runUntilBlocked(50);
        var sentAt = deliveries.lastSentTo(GROUP, FIRST_TEXT).orElseThrow();

        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        assertThat(gateway.sent()).hasSize(1);
        assertThat(dispatcher.state()).isEqualTo(DispatcherState.WAITING_GROUPS);
        var notBefore = deliveries.earliestPostponed(repeat).orElseThrow();
        assertThat(notBefore).isBetween(sentAt.plus(SHORTEST_PACE), sentAt.plus(INTERVAL));
        assertThat(deliveryOf(repeat).error()).contains("писали меньше " + INTERVAL_MINUTES + " мин назад");

        clock.set(LocalDateTime.ofInstant(sentAt.plus(SHORTEST_PACE).minusSeconds(1), clock.getZone()));
        runUntilBlocked(50);
        assertThat(gateway.sent()).hasSize(1);

        clock.set(LocalDateTime.ofInstant(notBefore, clock.getZone()));
        runUntilBlocked(50);
        assertThat(gateway.sent()).hasSize(2).allMatch(message -> message.text().equals(FIRST_TEXT));
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void differentTextIsNotHeldByTheGroupIntervalButTheSameTextStillIs() throws Exception {
        useGroups(1);
        pace(INTERVAL_MINUTES, false);
        queue(FIRST_TEXT);
        runUntilBlocked(50);

        var other = queue(SECOND_TEXT);
        runUntilBlocked(50);

        assertThat(gateway.sent()).extracting(message -> message.text()).containsExactly(FIRST_TEXT, SECOND_TEXT);
        assertThat(requests.find(other).orElseThrow().status()).isEqualTo(RequestStatus.DONE);

        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        assertThat(gateway.sent()).hasSize(2);
        assertThat(deliveries.earliestPostponed(repeat)).isPresent();
    }

    @Test
    void sameTextWaitsForSomeoneToWriteAndIsRecheckedEveryTenMinutes() throws Exception {
        useGroups(1);
        pace(0, true);
        queue(FIRST_TEXT);
        runUntilBlocked(50);

        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        assertThat(gateway.sent()).hasSize(1);
        assertThat(dispatcher.state()).isEqualTo(DispatcherState.WAITING_GROUPS);
        assertThat(deliveries.earliestPostponed(repeat)).contains(clock.instant().plus(REPLY_RECHECK));
        assertThat(deliveryOf(repeat).error()).contains("никто не написал");

        clock.advance(REPLY_RECHECK);
        runUntilBlocked(50);
        assertThat(gateway.sent()).hasSize(1);
        assertThat(deliveries.earliestPostponed(repeat)).contains(clock.instant().plus(REPLY_RECHECK));

        gateway.simulateForeignMessage(GROUP);
        runUntilBlocked(50);
        assertThat(gateway.sent()).as("ждёт следующей проверки").hasSize(1);

        clock.advance(REPLY_RECHECK);
        runUntilBlocked(50);
        assertThat(gateway.sent()).hasSize(2);
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void ourLastMessageWithAnotherTextDoesNotHoldTheDelivery() throws Exception {
        useGroups(1);
        pace(0, true);
        queue(FIRST_TEXT);
        runUntilBlocked(50);
        queue(SECOND_TEXT);
        runUntilBlocked(50);

        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        assertThat(gateway.sent()).extracting(message -> message.text()).containsExactly(FIRST_TEXT, SECOND_TEXT, FIRST_TEXT);
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
    }

    @Test
    void groupStillWaitingForAReplyIsSkippedWhenTheWorkWindowCloses() throws Exception {
        useGroups(1);
        pace(0, true);
        queue(FIRST_TEXT);
        runUntilBlocked(50);
        var quiet = sentJids().getFirst();
        useGroups(2);
        var fresh = "12036399000002@g.us";

        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        assertThat(sentJids()).containsExactly(quiet, fresh);
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.SENDING);

        clock.set(LocalDateTime.of(2026, 9, 28, 20, 1));
        dispatcher.cycle();

        assertThat(sentJids()).hasSize(2);
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.DONE);
        assertThat(deliveries.findByRequest(repeat)).filteredOn(d -> d.groupJid().equals(quiet)).singleElement().satisfies(d -> {
            assertThat(d.status()).isEqualTo(DeliveryStatus.SKIPPED);
            assertThat(d.error()).contains("до конца рабочего окна");
        });
    }

    @Test
    void yesterdaysDeliveryStillWaitingForAReplyIsSkippedNextMorning() throws Exception {
        useGroups(1);
        pace(0, true);
        queue(FIRST_TEXT);
        runUntilBlocked(50);
        var repeat = queue(FIRST_TEXT);
        runUntilBlocked(50);

        clock.set(LocalDateTime.of(2026, 9, 29, 9, 0));
        dispatcher.cycle();

        assertThat(gateway.sent()).hasSize(1);
        assertThat(requests.find(repeat).orElseThrow().status()).isEqualTo(RequestStatus.FAILED);
        assertThat(deliveryOf(repeat).status()).isEqualTo(DeliveryStatus.SKIPPED);
    }
}
