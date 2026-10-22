package kz.wasender.web;

import kz.wasender.notify.TelegramBot;
import kz.wasender.notify.TelegramNotifier;
import kz.wasender.notify.TelegramSubscriberRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/admin/telegram")
public class TelegramController {
    private final TelegramSubscriberRepository subscribers;
    private final TelegramNotifier notifier;
    private final TelegramBot bot;
    private final Clock clock;

    public TelegramController(TelegramSubscriberRepository subscribers, TelegramNotifier notifier, TelegramBot bot, Clock clock) {
        this.subscribers = subscribers;
        this.notifier = notifier;
        this.bot = bot;
        this.clock = clock;
    }

    @GetMapping
    public Overview overview() {
        var configured = notifier.configuredChatIds().stream().map(bot::chatInfo).toList();
        return new Overview(bot.configured(), bot.username(), configured, subscribers.findAll());
    }

    @PostMapping("/subscribers/{chatId}/approve")
    public ResponseEntity<?> approve(@PathVariable String chatId) {
        if (!subscribers.decide(chatId, TelegramSubscriberRepository.Status.APPROVED, Instant.now(clock))) {
            return ResponseEntity.notFound().build();
        }
        notifier.sendTo(chatId, "Подписка одобрена: теперь сюда будут приходить уведомления wa-group-sender. Отписаться — /stop.");
        return ResponseEntity.ok(subscribers.find(chatId).orElseThrow());
    }

    @PostMapping("/subscribers/{chatId}/reject")
    public ResponseEntity<?> reject(@PathVariable String chatId) {
        if (!subscribers.decide(chatId, TelegramSubscriberRepository.Status.REJECTED, Instant.now(clock))) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(subscribers.find(chatId).orElseThrow());
    }

    @DeleteMapping("/subscribers/{chatId}")
    public ResponseEntity<?> remove(@PathVariable String chatId) {
        var found = subscribers.find(chatId);
        if (found.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        subscribers.delete(chatId);
        if (found.get().status() == TelegramSubscriberRepository.Status.APPROVED) {
            notifier.sendTo(chatId, "Вас отключили от уведомлений wa-group-sender.");
        }
        return ResponseEntity.noContent().build();
    }

    public record Overview(boolean botConfigured, @Nullable String botUsername, List<TelegramBot.ChatInfo> configuredChats,
                           List<TelegramSubscriberRepository.Subscriber> subscribers) {
    }
}
