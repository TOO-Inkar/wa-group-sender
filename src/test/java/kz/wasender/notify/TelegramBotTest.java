package kz.wasender.notify;

import kz.wasender.platform.InviteCodes;
import kz.wasender.platform.Tenant;
import kz.wasender.platform.TenantRepository;
import kz.wasender.support.IntegrationTest;
import kz.wasender.support.TestTenantEngines;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class TelegramBotTest extends IntegrationTest {
    @Autowired
    TelegramBot bot;
    @Autowired
    TelegramSubscriberRepository subscribers;
    @Autowired
    TelegramNotifier notifier;
    @Autowired
    TenantRepository tenants;
    @Autowired
    TestTenantEngines engines;

    private Tenant secondTenant() {
        var tenant = tenants.create("Кабинет 2", false, InviteCodes.random(), clock.instant());
        engines.start(tenant);
        return tenant;
    }

    private TelegramSubscriberRepository subscribersOf(Tenant tenant) {
        return engines.get(tenant.id()).bean(TelegramSubscriberRepository.class);
    }

    private static TelegramBot.Update update(long id, long chatId, String text) {
        return new TelegramBot.Update(id, new TelegramBot.Message(new TelegramBot.Chat(chatId, "private", null),
                new TelegramBot.User("Айгерим", null, "aigerim"), text));
    }

    @Test
    void startCreatesAPendingRequestThatBecomesARecipientOnlyAfterApproval() {
        bot.handle(update(1, 555, "/start"));

        assertThat(subscribers.find("555")).hasValueSatisfying(s -> {
            assertThat(s.status()).isEqualTo(TelegramSubscriberRepository.Status.PENDING);
            assertThat(s.name()).isEqualTo("Айгерим");
            assertThat(s.username()).isEqualTo("aigerim");
        });
        assertThat(notifier.chatIds()).doesNotContain("555");

        subscribers.decide("555", TelegramSubscriberRepository.Status.APPROVED, clock.instant());
        assertThat(notifier.chatIds()).contains("555");

        bot.handle(update(2, 555, "/stop"));
        assertThat(subscribers.find("555")).isEmpty();
        assertThat(notifier.chatIds()).doesNotContain("555");
    }

    @Test
    void rejectedChatCanAskAgain() {
        bot.handle(update(1, 777, "/start"));
        subscribers.decide("777", TelegramSubscriberRepository.Status.REJECTED, clock.instant());

        bot.handle(update(2, 777, "/start@wa_sender_bot"));

        assertThat(subscribers.find("777").orElseThrow().status()).isEqualTo(TelegramSubscriberRepository.Status.PENDING);
    }

    @Test
    void inviteCodeSubscribesToThatTenantOnly() {
        var second = secondTenant();

        bot.handle(update(1, 901, "/start " + second.inviteCode()));

        assertThat(subscribersOf(second).find("901")).isPresent();
        assertThat(subscribers.find("901")).isEmpty();
    }

    @Test
    void startWithoutCodeIsRefusedWhenSeveralTenantsAreActive() {
        secondTenant();

        bot.handle(update(1, 902, "/start"));
        bot.handle(update(2, 903, "/start deadbeef"));

        assertThat(subscribers.find("902")).isEmpty();
        assertThat(subscribers.find("903")).isEmpty();
    }

    @Test
    void stopRemovesTheChatFromEveryTenant() {
        var second = secondTenant();
        var legacy = tenants.find(1).orElseThrow();
        bot.handle(update(1, 904, "/start " + legacy.inviteCode()));
        bot.handle(update(2, 904, "/start " + second.inviteCode()));
        assertThat(subscribers.find("904")).isPresent();
        assertThat(subscribersOf(second).find("904")).isPresent();

        bot.handle(update(3, 904, "/stop"));

        assertThat(subscribers.find("904")).isEmpty();
        assertThat(subscribersOf(second).find("904")).isEmpty();
    }

    @Test
    void inviteLinkNeedsAKnownBotUsername() {
        assertThat(bot.inviteLink(tenants.find(1).orElseThrow())).isNull();
    }
}
