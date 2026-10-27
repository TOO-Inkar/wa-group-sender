package kz.wasender.platform;

import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class UserRepository {
    private static final RowMapper<AppUser> MAPPER = (rs, n) -> new AppUser(
            rs.getLong("id"),
            rs.getObject("tenant_id", Long.class),
            rs.getString("login"),
            rs.getString("password_hash"),
            Role.valueOf(rs.getString("role")),
            rs.getBoolean("enabled"),
            rs.getInt("session_version"),
            rs.getObject("created_at", Instant.class),
            rs.getObject("last_login_at", Instant.class));

    private final JdbcClient jdbc;

    public UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public long count() {
        return jdbc.sql("select count(*) from app_user").query(Long.class).single();
    }

    public Optional<AppUser> find(long id) {
        return jdbc.sql("select * from app_user where id = ?").param(id).query(MAPPER).optional();
    }

    public Optional<AppUser> findByLogin(String login) {
        return jdbc.sql("select * from app_user where lower(login) = lower(?)").param(login).query(MAPPER).optional();
    }

    public Optional<AppUser> firstSuperadmin() {
        return jdbc.sql("select * from app_user where role = 'SUPERADMIN' and enabled order by id limit 1").query(MAPPER).optional();
    }

    public List<AppUser> findByTenant(long tenantId) {
        return jdbc.sql("select * from app_user where tenant_id = ? order by id").param(tenantId).query(MAPPER).list();
    }

    public Map<Long, Integer> countByTenant() {
        var counts = new HashMap<Long, Integer>();
        jdbc.sql("select tenant_id, count(*) as users from app_user where tenant_id is not null group by tenant_id")
                .query(rs -> {
                    counts.put(rs.getLong("tenant_id"), rs.getInt("users"));
                });
        return counts;
    }

    public boolean loginTaken(String login) {
        return jdbc.sql("select count(*) from app_user where lower(login) = lower(?)").param(login).query(Long.class).single() > 0;
    }

    public AppUser create(@Nullable Long tenantId, String login, String passwordHash, Role role, Instant now) {
        var keys = new GeneratedKeyHolder();
        jdbc.sql("insert into app_user (tenant_id, login, password_hash, role, created_at) values (?, ?, ?, ?, ?)")
                .params(tenantId, login, passwordHash, role.name(), now)
                .update(keys, "id");
        return find(keys.getKeyAs(Long.class)).orElseThrow();
    }

    public void setEnabled(long id, boolean enabled) {
        jdbc.sql("update app_user set enabled = ?, session_version = session_version + 1 where id = ?").params(enabled, id).update();
    }

    public void setPassword(long id, String passwordHash) {
        jdbc.sql("update app_user set password_hash = ?, session_version = session_version + 1 where id = ?").params(passwordHash, id).update();
    }

    public void assign(long id, @Nullable Long tenantId, Role role) {
        jdbc.sql("update app_user set tenant_id = ?, role = ?, session_version = session_version + 1 where id = ?")
                .params(tenantId, role.name(), id).update();
    }

    public void touchLogin(long id, Instant at) {
        jdbc.sql("update app_user set last_login_at = ? where id = ?").params(at, id).update();
    }

    public void delete(long id) {
        jdbc.sql("delete from app_user where id = ?").param(id).update();
    }
}
