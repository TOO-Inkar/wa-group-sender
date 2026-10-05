package kz.wasender.request;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

@Repository
public class RequestRepository {

    private static final RowMapper<RequestRecord> MAPPER = (rs, n) -> new RequestRecord(
            rs.getString("id"),
            (Integer) rs.getObject("sheet_row"),
            rs.getString("message"),
            RequestStatus.valueOf(rs.getString("status")),
            rs.getString("error"),
            rs.getObject("queued_at", Instant.class),
            rs.getObject("started_at", Instant.class),
            rs.getObject("completed_at", Instant.class));

    private final JdbcClient jdbc;

    public RequestRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<RequestRecord> find(String id) {
        return jdbc.sql("select * from request where id = ?").param(id).query(MAPPER).optional();
    }

    public boolean exists(String id) {
        return jdbc.sql("select count(*) from request where id = ?").param(id).query(Integer.class).single() > 0;
    }

    public void insert(String id, int sheetRow, String message, Instant queuedAt) {
        jdbc.sql("insert into request(id, sheet_row, message, status, queued_at) values (?, ?, ?, 'QUEUED', ?)")
                .params(id, sheetRow, message, queuedAt)
                .update();
    }

    /** A request entered in the admin page; with target groups it goes only to them, otherwise to every active group. */
    public void insert(String id, String message, Instant queuedAt, Collection<String> targetGroups) {
        jdbc.sql("insert into request(id, message, status, queued_at, targeted) values (?, ?, 'QUEUED', ?, ?)")
                .params(id, message, queuedAt, !targetGroups.isEmpty())
                .update();
        for (var jid : new LinkedHashSet<>(targetGroups)) {
            jdbc.sql("insert into request_target(request_id, group_jid) values (?, ?)").params(id, jid).update();
        }
    }

    public boolean isTargeted(String id) {
        return jdbc.sql("select targeted from request where id = ?").param(id).query(Boolean.class).optional().orElse(false);
    }

    public List<String> targets(String id) {
        return jdbc.sql("select group_jid from request_target where request_id = ? order by group_jid").param(id).query(String.class).list();
    }

    public void updateRow(String id, int sheetRow) {
        jdbc.sql("update request set sheet_row = ? where id = ? and (sheet_row is null or sheet_row <> ?)")
                .params(sheetRow, id, sheetRow)
                .update();
    }

    public List<RequestRecord> findQueuedBetween(Instant from, Instant to) {
        return jdbc.sql("select * from request where queued_at >= ? and queued_at < ? order by queued_at, id")
                .params(from, to)
                .query(MAPPER)
                .list();
    }

    public Optional<RequestRecord> nextInQueue() {
        // The request already being sent goes first: a finished one put back for a retry must not cut in.
        return jdbc.sql("select * from request where status in ('QUEUED', 'SENDING') "
                        + "order by case when status = 'SENDING' then 0 else 1 end, queued_at, id limit 1")
                .query(MAPPER)
                .optional();
    }

    public int queueLength() {
        return jdbc.sql("select count(*) from request where status in ('QUEUED', 'SENDING')").query(Integer.class).single();
    }

    public void markSending(String id, Instant at) {
        jdbc.sql("update request set status = 'SENDING', started_at = coalesce(started_at, ?) where id = ?")
                .params(at, id)
                .update();
    }

    /** A finished request goes back to the queue to retry the groups that failed. */
    public void requeue(String id) {
        jdbc.sql("update request set status = 'QUEUED', error = null, completed_at = null where id = ?").param(id).update();
    }

    public void complete(String id, RequestStatus status, String error, Instant at) {
        jdbc.sql("update request set status = ?, error = ?, completed_at = ? where id = ?")
                .params(status.name(), error, at, id)
                .update();
    }

    public List<String> findAllIds() {
        return jdbc.sql("select id from request").query(String.class).list();
    }

    public List<RequestRecord> findAll() {
        return jdbc.sql("select * from request order by queued_at, id").query(MAPPER).list();
    }
}
