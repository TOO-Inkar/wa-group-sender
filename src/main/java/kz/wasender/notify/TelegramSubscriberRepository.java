package kz.wasender.notify;

import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class TelegramSubscriberRepository {
    private static final RowMapper<Subscriber> MAPPER = (rs, n) -> new Subscriber(
            rs.getString("chat_id"),
            rs.getString("name"),
            rs.getString("username"),
            Status.valueOf(rs.getString("status")),
            rs.getObject("requested_at", Instant.class),
            rs.getObject("decided_at", Instant.class));

    private final JdbcClient jdbc;

    public TelegramSubscriberRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Subscriber> findAll() {
        return jdbc.sql("select * from telegram_subscriber order by case status when 'PENDING' then 0 when 'APPROVED' then 1 else 2 end, requested_at desc")
                .query(MAPPER).list();
    }

    public Optional<Subscriber> find(String chatId) {
        return jdbc.sql("select * from telegram_subscriber where chat_id = ?").param(chatId).query(MAPPER).optional();
    }

    public List<String> approvedChatIds() {
        return jdbc.sql("select chat_id from telegram_subscriber where status = 'APPROVED' order by chat_id").query(String.class).list();
    }

    public Subscriber request(String chatId, String name, String username, Instant at) {
        var existing = find(chatId);
        if (existing.isEmpty()) {
            jdbc.sql("insert into telegram_subscriber(chat_id, name, username, status, requested_at) values (?, ?, ?, 'PENDING', ?)")
                    .params(chatId, name, username, at).update();
        } else if (existing.get().status() == Status.REJECTED) {
            jdbc.sql("update telegram_subscriber set name = ?, username = ?, status = 'PENDING', requested_at = ?, decided_at = null where chat_id = ?")
                    .params(name, username, at, chatId).update();
        } else {
            jdbc.sql("update telegram_subscriber set name = ?, username = ? where chat_id = ?").params(name, username, chatId).update();
        }
        return find(chatId).orElseThrow();
    }

    public boolean decide(String chatId, Status status, Instant at) {
        return jdbc.sql("update telegram_subscriber set status = ?, decided_at = ? where chat_id = ?").params(status.name(), at, chatId).update() > 0;
    }

    public boolean delete(String chatId) {
        return jdbc.sql("delete from telegram_subscriber where chat_id = ?").param(chatId).update() > 0;
    }

    public enum Status { PENDING, APPROVED, REJECTED }

    public record Subscriber(String chatId, @Nullable String name, @Nullable String username, Status status, Instant requestedAt,
                             @Nullable Instant decidedAt) {
    }
}
