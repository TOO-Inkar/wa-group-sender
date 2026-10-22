package kz.wasender.group;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;

@Repository
public class GroupListRepository {
    private final JdbcClient jdbc;

    public GroupListRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<GroupList> findAll() {
        return jdbc.sql("select id, name from group_list order by name")
                .query((rs, n) -> new GroupList(rs.getLong("id"), rs.getString("name"), List.of()))
                .list().stream()
                .map(list -> new GroupList(list.id(), list.name(), members(list.id())))
                .toList();
    }

    @Transactional
    public GroupList save(String name, Collection<String> groupJids, Instant at) {
        var id = jdbc.sql("select id from group_list where name = ?").param(name).query(Long.class).optional()
                .orElseGet(() -> {
                    jdbc.sql("insert into group_list(name, created_at) values (?, ?)").params(name, at).update();
                    return jdbc.sql("select id from group_list where name = ?").param(name).query(Long.class).single();
                });
        jdbc.sql("delete from group_list_member where list_id = ?").param(id).update();
        for (var jid : new LinkedHashSet<>(groupJids)) {
            jdbc.sql("insert into group_list_member(list_id, group_jid) values (?, ?)").params(id, jid).update();
        }
        return new GroupList(id, name, members(id));
    }

    public boolean delete(long id) {
        return jdbc.sql("delete from group_list where id = ?").param(id).update() > 0;
    }

    private List<String> members(long id) {
        return jdbc.sql("select group_jid from group_list_member where list_id = ? order by group_jid").param(id).query(String.class).list();
    }

    public record GroupList(long id, String name, List<String> groups) {
    }
}
