package kz.wasender.platform;

import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Repository
public class AuditLog {
    private static final int MAX_DETAIL = 1000;
    private static final RowMapper<AuditEntry> MAPPER = (rs, n) -> new AuditEntry(
            rs.getObject("at", Instant.class),
            rs.getString("actor_login"),
            rs.getObject("tenant_id", Long.class),
            rs.getString("tenant_name"),
            AuditAction.valueOf(rs.getString("action")),
            rs.getString("detail"),
            rs.getString("ip"));

    private final JdbcClient jdbc;
    private final Clock clock;

    public AuditLog(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void record(Actor actor, AuditAction action, @Nullable Long tenantId, @Nullable String detail) {
        record(actor.userId(), actor.login(), actor.ip(), action, tenantId, detail);
    }

    public void record(@Nullable Long userId, @Nullable String login, @Nullable String ip, AuditAction action,
                       @Nullable Long tenantId, @Nullable String detail) {
        var trimmed = detail == null || detail.length() <= MAX_DETAIL ? detail : detail.substring(0, MAX_DETAIL);
        jdbc.sql("insert into audit_log (at, actor_user_id, actor_login, tenant_id, action, detail, ip) values (?, ?, ?, ?, ?, ?, ?)")
                .params(Instant.now(clock), userId, login, tenantId, action.name(), trimmed, ip)
                .update();
    }

    public List<AuditEntry> recent(@Nullable Long tenantId, int limit) {
        return jdbc.sql("""
                        select a.*, t.name as tenant_name from audit_log a left join tenant t on t.id = a.tenant_id
                        where (cast(? as bigint) is null or a.tenant_id = ?) order by a.id desc limit ?""")
                .params(tenantId, tenantId, limit)
                .query(MAPPER).list();
    }
}
