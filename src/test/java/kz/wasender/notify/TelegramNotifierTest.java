package kz.wasender.notify;

import com.sun.net.httpserver.HttpServer;
import kz.wasender.config.NotifyProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

class TelegramNotifierTest {
    private HttpServer server;
    private final List<String> bodies = new CopyOnWriteArrayList<>();

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            bodies.add(exchange.getRequestURI().getPath() + " " + body);
            var status = body.contains("\"broken\"") ? 400 : 200;
            var response = status == 200 ? "{\"ok\":true}" : "{\"ok\":false}";
            exchange.sendResponseHeaders(status, response.length());
            exchange.getResponseBody().write(response.getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private TelegramNotifier notifier(String token, List<String> chatIds) {
        var url = "http://127.0.0.1:" + server.getAddress().getPort();
        return new TelegramNotifier(new NotifyProperties(Duration.ofMinutes(15), new NotifyProperties.Telegram(token, chatIds, url)));
    }

    @Test
    void sendsToEveryChatAndSurvivesFailureOfOne() {
        var notifier = notifier("TOKEN", List.of("111", " broken ", "-222"));

        var delivered = notifier.send("Рассылка ОСТАНОВЛЕНА 🔥");

        assertThat(delivered).isEqualTo(2);
        assertThat(bodies).hasSize(3).allMatch(body -> body.startsWith("/botTOKEN/sendMessage"));
        assertThat(bodies.get(0)).contains("\"111\"").contains("Рассылка ОСТАНОВЛЕНА 🔥");
        assertThat(bodies.get(2)).contains("\"-222\"");
    }

    @Test
    void notConfiguredWithoutTokenOrChats() {
        assertThat(notifier("", List.of("1")).configured()).isFalse();
        assertThat(notifier("T", List.of()).configured()).isFalse();
        assertThat(notifier("T", List.of(" ")).configured()).isFalse();
        assertThat(notifier("T", List.of("1")).configured()).isTrue();
    }
}
