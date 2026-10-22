package kz.wasender.notify;

import kz.wasender.support.IntegrationTest;
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
}
