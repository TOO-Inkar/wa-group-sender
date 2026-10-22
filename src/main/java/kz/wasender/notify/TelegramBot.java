package kz.wasender.notify;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.annotation.PreDestroy;
import kz.wasender.config.NotifyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Подписка на уведомления через бота: /start — запрос, который администратор одобряет в админке;
 * /stop — отписка. Бот читает сообщения long-poll'ом getUpdates, вебхук не нужен.
 */
@Service
public class TelegramBot {

    private static final Logger log = LoggerFactory.getLogger(TelegramBot.class);
    private static final int POLL_SECONDS = 25;
    private static final Duration RETRY_DELAY = Duration.ofSeconds(15);

    private final NotifyProperties.Telegram properties;
    private final TelegramSubscriberRepository subscribers;
    private final TelegramNotifier notifier;
    private final Clock clock;
    private final RestClient client;
    private volatile Thread poller;
    private volatile boolean stopped;
    private volatile String username;
    private final java.util.Map<String, ChatInfo> chats = new java.util.concurrent.ConcurrentHashMap<>();

    public TelegramBot(NotifyProperties properties, TelegramSubscriberRepository subscribers, TelegramNotifier notifier, Clock clock) {
        this.properties = properties.telegram();
        this.subscribers = subscribers;
        this.notifier = notifier;
        this.clock = clock;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        factory.setReadTimeout(Duration.ofSeconds(POLL_SECONDS + 15));
        this.client = RestClient.builder().baseUrl(this.properties.apiUrl()).requestFactory(factory).build();
    }

    public boolean configured() {
        return properties.botToken() != null && !properties.botToken().isBlank();
    }

    public synchronized void start() {
        if (!configured() || poller != null) {
            return;
        }
        poller = Thread.ofVirtual().name("telegram-bot").start(this::loop);
        log.info("TELEGRAM bot polling started");
    }

    @PreDestroy
    void stop() {
        stopped = true;
        if (poller != null) {
            poller.interrupt();
        }
    }

    /**
     * Кто стоит за chat_id: имя и @username (или название группы) через getChat; телефон Bot API не отдаёт.
     * Запоминается до перезапуска, чтобы не дёргать Telegram при каждом открытии настроек.
     */
    public ChatInfo chatInfo(String chatId) {
        return chats.computeIfAbsent(chatId, id -> {
            try {
                var chat = client.get().uri("/bot{token}/getChat?chat_id={id}", properties.botToken(), id).retrieve().body(GetChat.class);
                if (chat == null || chat.result() == null) {
                    return new ChatInfo(id, null, null);
                }
                var c = chat.result();
                var name = c.title() != null ? c.title()
                        : ((c.firstName() == null ? "" : c.firstName()) + " " + (c.lastName() == null ? "" : c.lastName())).strip();
                return new ChatInfo(id, name.isEmpty() ? null : name, c.username());
            } catch (RuntimeException e) {
                log.warn("TELEGRAM getChat {} failed: {}", id, e.getMessage());
                return new ChatInfo(id, null, null);
            }
        });
    }

    /** @username бота, чтобы показать в админке, кому писать /start. */
    public String username() {
        if (username == null && configured()) {
            try {
                var me = client.get().uri("/bot{token}/getMe", properties.botToken()).retrieve().body(Me.class);
                if (me != null && me.result() != null) {
                    username = me.result().username();
                }
            } catch (RuntimeException e) {
                log.warn("TELEGRAM getMe failed: {}", e.getMessage());
            }
        }
        return username;
    }

    private void loop() {
        long offset = 0;
        while (!stopped) {
            try {
                var updates = client.get()
                        .uri("/bot{token}/getUpdates?timeout={timeout}&offset={offset}&allowed_updates=[\"message\"]",
                                properties.botToken(), POLL_SECONDS, offset)
                        .retrieve().body(Updates.class);
                if (updates == null || updates.result() == null) {
                    continue;
                }
                for (var update : updates.result()) {
                    offset = Math.max(offset, update.updateId() + 1);
                    try {
                        handle(update);
                    } catch (RuntimeException e) {
                        log.error("TELEGRAM update {} failed", update.updateId(), e);
                    }
                }
            } catch (RestClientResponseException e) {
                // 409: getUpdates читает другой процесс с тем же токеном (или задан вебхук).
                log.warn("TELEGRAM getUpdates HTTP {}: {}", e.getStatusCode().value(), e.getResponseBodyAsString());
                if (!sleepQuietly()) {
                    return;
                }
            } catch (RuntimeException e) {
                if (stopped) {
                    return;
                }
                log.warn("TELEGRAM getUpdates failed: {}", e.toString());
                if (!sleepQuietly()) {
                    return;
                }
            }
        }
    }

    void handle(Update update) {
        var message = update.message();
        if (message == null || message.chat() == null || message.text() == null) {
            return;
        }
        if (!"private".equals(message.chat().type()) && !message.text().startsWith("/")) {
            return;
        }
        var chatId = Long.toString(message.chat().id());
        var command = message.text().strip().split("[\\s@]", 2)[0].toLowerCase();
        switch (command) {
            case "/start" -> start(chatId, message);
            case "/stop" -> {
                var removed = subscribers.delete(chatId);
                notifier.sendTo(chatId, removed ? "Вы отписались от уведомлений wa-group-sender." : "Вы и так не подписаны.");
                if (removed) {
                    log.info("TELEGRAM unsubscribed chat_id={}", chatId);
                }
            }
            default -> notifier.sendTo(chatId, "Этот бот присылает уведомления о рассылке wa-group-sender.\n"
                    + "/start — попросить подписку, /stop — отписаться.");
        }
    }

    private void start(String chatId, Message message) {
        if (notifier.configuredChatIds().contains(chatId)) {
            notifier.sendTo(chatId, "Этот чат уже получает уведомления (задан в настройках сервера).");
            return;
        }
        var name = message.chat().title() != null ? message.chat().title() : fullName(message.from());
        var username = message.from() == null ? null : message.from().username();
        var before = subscribers.find(chatId);
        var subscriber = subscribers.request(chatId, name, username, Instant.now(clock));
        switch (subscriber.status()) {
            case APPROVED -> notifier.sendTo(chatId, "Вы уже подписаны на уведомления.");
            case PENDING -> {
                notifier.sendTo(chatId, "Запрос на подписку отправлен. Уведомления начнут приходить, когда администратор одобрит его.");
                if (before.isEmpty() || before.get().status() != TelegramSubscriberRepository.Status.PENDING) {
                    log.info("TELEGRAM subscription requested chat_id={} name=\"{}\" username={}", chatId, name, username);
                    var who = name + (username == null ? "" : " (@" + username + ")");
                    for (var admin : notifier.chatIds()) {
                        notifier.sendTo(admin, "[wa-group-sender] " + who + " просит подписку на уведомления. Одобрите в админке: Настройки → Уведомления.");
                    }
                }
            }
            case REJECTED -> notifier.sendTo(chatId, "Запрос на подписку отклонён.");
        }
    }

    private static String fullName(User user) {
        if (user == null) {
            return "без имени";
        }
        var name = ((user.firstName() == null ? "" : user.firstName()) + " " + (user.lastName() == null ? "" : user.lastName())).strip();
        return name.isEmpty() ? (user.username() == null ? "без имени" : user.username()) : name;
    }

    private boolean sleepQuietly() {
        try {
            Thread.sleep(RETRY_DELAY);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    record Updates(Boolean ok, List<Update> result) {
    }

    record Update(@JsonProperty("update_id") long updateId, Message message) {
    }

    record Message(Chat chat, User from, String text) {
    }

    record Chat(long id, String type, String title) {
    }

    record User(@JsonProperty("first_name") String firstName, @JsonProperty("last_name") String lastName, String username) {
    }

    public record ChatInfo(String chatId, String name, String username) {
    }

    record GetChat(Boolean ok, ChatResult result) {
    }

    record ChatResult(String title, @JsonProperty("first_name") String firstName, @JsonProperty("last_name") String lastName,
                      String username) {
    }

    record Me(Boolean ok, MeResult result) {
    }

    record MeResult(String username) {
    }
}
