package kz.wasender.platform;

import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class TenantRepository {
    private static final RowMapper<Tenant> MAPPER = (rs, n) -> new Tenant(
            rs.getLong("id"),
            rs.getString("name"),
            TenantStatus.valueOf(rs.getString("status")),
            rs.getBoolean("legacy"),
            rs.getString("invite_code"),
            rs.getObject("created_at", Instant.class),
            rs.getString("proxy_url"));

    private final JdbcClient jdbc;

    public TenantRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Tenant> findAll() {
        return jdbc.sql("select * from tenant order by id").query(MAPPER).list();
    }

    public List<Tenant> findActive() {
        return jdbc.sql("select * from tenant where status = 'ACTIVE' order by id").query(MAPPER).list();
    }

    public Optional<Tenant> find(long id) {
        return jdbc.sql("select * from tenant where id = ?").param(id).query(MAPPER).optional();
    }

    public Optional<Tenant> findByInviteCode(String code) {
        return jdbc.sql("select * from tenant where invite_code = ?").param(code).query(MAPPER).optional();
    }

    public boolean nameTaken(String name, long exceptId) {
        return jdbc.sql("select count(*) from tenant where lower(name) = lower(?) and id <> ?").params(name, exceptId).query(Long.class).single() > 0;
    }

    public Tenant create(String name, boolean legacy, String inviteCode, Instant now) {
        return create(name, legacy, inviteCode, now, null);
    }

    public Tenant create(String name, boolean legacy, String inviteCode, Instant now, @Nullable String proxyUrl) {
        var keys = new GeneratedKeyHolder();
        jdbc.sql("insert into tenant (name, status, legacy, invite_code, created_at, proxy_url) values (?, 'ACTIVE', ?, ?, ?, ?)")
                .params(name, legacy, inviteCode, now, proxyUrl)
                .update(keys, "id");
        return find(keys.getKeyAs(Long.class)).orElseThrow();
    }

    public void rename(long id, String name) {
        jdbc.sql("update tenant set name = ? where id = ?").params(name, id).update();
    }

    public void setStatus(long id, TenantStatus status) {
        jdbc.sql("update tenant set status = ? where id = ?").params(status.name(), id).update();
    }

    public void setProxy(long id, @Nullable String proxyUrl) {
        jdbc.sql("update tenant set proxy_url = ? where id = ?").params(proxyUrl, id).update();
    }

    public void delete(long id) {
        jdbc.sql("delete from tenant where id = ?").param(id).update();
    }
}
