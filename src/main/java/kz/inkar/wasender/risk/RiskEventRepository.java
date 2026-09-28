package kz.inkar.wasender.risk;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;

@Repository
public class RiskEventRepository {

    private final JdbcClient jdbc;

    public RiskEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(RiskType type, String groupJid, String requestId, String detail, Instant at) {
        jdbc.sql("insert into risk_event(type, group_jid, request_id, detail, created_at) values (?, ?, ?, ?, ?)")
                .params(type.name(), groupJid, requestId, truncate(detail), at)
                .update();
    }

    public int countSince(Instant since, Collection<RiskType> types) {
        return jdbc.sql("select count(*) from risk_event where created_at > :since and type in (:types)")
                .param("since", since)
                .param("types", types.stream().map(Enum::name).toList())
                .query(Integer.class)
                .single();
    }

    public Optional<RiskEvent> latestOf(Collection<RiskType> types) {
        return jdbc.sql("select type, created_at from risk_event where type in (:types) order by id desc limit 1")
                .param("types", types.stream().map(Enum::name).toList())
                .query((rs, n) -> new RiskEvent(RiskType.valueOf(rs.getString("type")), rs.getObject("created_at", Instant.class)))
                .optional();
    }

    private static String truncate(String value) {
        return value == null || value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    public record RiskEvent(RiskType type, Instant at) {
    }
}
