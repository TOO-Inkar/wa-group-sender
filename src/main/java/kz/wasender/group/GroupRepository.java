package kz.wasender.group;

import kz.wasender.whatsapp.GroupInfo;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public class GroupRepository {

    private static final RowMapper<GroupRecord> MAPPER = (rs, n) -> new GroupRecord(
            rs.getString("jid"),
            rs.getString("name"),
            rs.getBoolean("archived"),
            (Boolean) rs.getObject("member"),
            (Boolean) rs.getObject("can_send"),
            rs.getBoolean("active"),
            rs.getObject("last_sync", Instant.class),
            (Integer) rs.getObject("participants"),
            rs.getBoolean("community"),
            rs.getBoolean("too_large"));

    private final JdbcClient jdbc;

    public GroupRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<GroupRecord> findAll() {
        return jdbc.sql("select * from wa_group order by active desc, name, jid").query(MAPPER).list();
    }

    public List<String> activeJids() {
        return jdbc.sql("select jid from wa_group where active order by jid").query(String.class).list();
    }

    public long activeCount() {
        return jdbc.sql("select count(*) from wa_group where active").query(Long.class).single();
    }

    public boolean isActive(String jid) {
        return jdbc.sql("select count(*) from wa_group where jid = ? and active").param(jid).query(Integer.class).single() > 0;
    }

    /** The number is in the group and may write there; unlike active, the group need not be archived. */
    public boolean isSendable(String jid) {
        return jdbc.sql("select count(*) from wa_group where jid = ? and member and can_send and not community and not too_large")
                .param(jid).query(Integer.class).single() > 0;
    }

    public void upsert(GroupInfo group, Instant at) {
        upsert(group, false, at);
    }

    /** Stores the group; it takes part in the dispatch when eligible and not too large. */
    public void upsert(GroupInfo group, boolean tooLarge, Instant at) {
        jdbc.sql("""
                        merge into wa_group(jid, name, archived, member, can_send, active, last_sync, participants, community, too_large)
                        key (jid) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                .params(group.jid(), group.name(), group.archived(), group.member(), group.canSend(), group.eligible() && !tooLarge, at,
                        group.participants(), group.isCommunity(), tooLarge)
                .update();
    }

    public void deactivate(String jid, Instant at) {
        jdbc.sql("update wa_group set active = false, last_sync = ? where jid = ?").params(at, jid).update();
    }

    public void markRemoved(String jid, Instant at) {
        jdbc.sql("update wa_group set active = false, member = false, last_sync = ? where jid = ?").params(at, jid).update();
    }
}
