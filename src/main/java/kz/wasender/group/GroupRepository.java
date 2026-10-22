package kz.wasender.group;

import kz.wasender.whatsapp.GroupInfo;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
            rs.getBoolean("too_large"),
            rs.getInt("rejected_count"),
            rs.getBoolean("rejected"));

    static final int REJECTIONS_TO_EXCLUDE = 2;

    private final JdbcClient jdbc;

    public GroupRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<GroupRecord> findAll() {
        return jdbc.sql("select * from wa_group order by active desc, name, jid").query(MAPPER).list();
    }

    public Map<String, String> namesByJid() {
        return jdbc.sql("select jid, name from wa_group where name is not null and trim(name) <> ''")
                .query((rs, n) -> Map.entry(rs.getString("jid"), rs.getString("name")))
                .list().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public List<GroupRecord> findPresent() {
        return jdbc.sql("select * from wa_group where present order by active desc, name, jid").query(MAPPER).list();
    }

    public int markAbsent(String jid, Instant at) {
        return jdbc.sql("update wa_group set present = false, active = false, last_sync = ? where jid = ? and present")
                .params(at, jid).update();
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

    public boolean isSendable(String jid) {
        return jdbc.sql("select count(*) from wa_group where jid = ? and present and member and can_send and not community and not too_large and not rejected")
                .param(jid).query(Integer.class).single() > 0;
    }

    public void upsert(GroupInfo group, Instant at) {
        upsert(group, false, false, at);
    }

    public void upsert(GroupInfo group, boolean tooLarge, boolean rejected, Instant at) {
        jdbc.sql("""
                        merge into wa_group(jid, name, archived, member, can_send, active, last_sync, participants, community, too_large, present)
                        key (jid) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)""")
                .params(group.jid(), group.name(), group.archived(), group.member(), group.canSend(), group.eligible() && !tooLarge && !rejected, at,
                        group.participants(), group.isCommunity(), tooLarge)
                .update();
    }

    public boolean recordRejection(String jid, Instant at) {
        jdbc.sql("update wa_group set rejected_count = rejected_count + 1 where jid = ?").param(jid).update();
        return jdbc.sql("update wa_group set rejected = true, active = false, last_sync = ? where jid = ? and not rejected and rejected_count >= ?")
                .params(at, jid, REJECTIONS_TO_EXCLUDE)
                .update() > 0;
    }

    public void clearRejections(String jid) {
        jdbc.sql("update wa_group set rejected_count = 0, rejected = false where jid = ? and (rejected_count > 0 or rejected)").param(jid).update();
    }

    public boolean resetRejections(String jid, Instant at) {
        return jdbc.sql("""
                        update wa_group set rejected_count = 0, rejected = false, last_sync = ?,
                            active = (present and archived and coalesce(member, false) and coalesce(can_send, false) and not community and not too_large)
                        where jid = ?""")
                .params(at, jid)
                .update() > 0;
    }

    public void deactivate(String jid, Instant at) {
        jdbc.sql("update wa_group set active = false, last_sync = ? where jid = ?").params(at, jid).update();
    }

    public void markRemoved(String jid, Instant at) {
        jdbc.sql("update wa_group set active = false, member = false, last_sync = ? where jid = ?").params(at, jid).update();
    }
}
