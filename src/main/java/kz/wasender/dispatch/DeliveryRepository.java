package kz.wasender.dispatch;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class DeliveryRepository {

    private static final RowMapper<DeliveryRecord> MAPPER = (rs, n) -> new DeliveryRecord(
            rs.getLong("id"),
            rs.getString("request_id"),
            rs.getString("group_jid"),
            rs.getInt("position"),
            DeliveryStatus.valueOf(rs.getString("status")),
            rs.getString("error"));

    private final JdbcClient jdbc;

    public DeliveryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean hasPlan(String requestId) {
        return jdbc.sql("select count(*) from delivery where request_id = ?").param(requestId).query(Integer.class).single() > 0;
    }

    public void createPlan(String requestId, List<String> groupJids, Instant at) {
        for (var position = 0; position < groupJids.size(); position++) {
            jdbc.sql("insert into delivery(request_id, group_jid, position, status, updated_at) values (?, ?, ?, 'PENDING', ?)")
                    .params(requestId, groupJids.get(position), position, at)
                    .update();
        }
    }

    /** Следующая доставка, которую можно делать сейчас: отложенные до not_before пропускаются. */
    public Optional<DeliveryRecord> nextReady(String requestId, Instant now) {
        return jdbc.sql("select * from delivery where request_id = ? and status = 'PENDING' and (not_before is null or not_before <= ?) "
                        + "order by position limit 1")
                .params(requestId, now)
                .query(MAPPER)
                .optional();
    }

    /** Когда освободится ближайшая отложенная доставка рассылки. */
    public Optional<Instant> earliestPostponed(String requestId) {
        return jdbc.sql("select min(not_before) from delivery where request_id = ? and status = 'PENDING' and not_before is not null")
                .param(requestId)
                .query(Instant.class)
                .optional();
    }

    /** Доставка ждёт до notBefore; причина видна в админке. */
    public void postpone(long id, Instant notBefore, String reason, Instant at) {
        jdbc.sql("update delivery set not_before = ?, error = ?, updated_at = ? where id = ?")
                .params(notBefore, truncate(reason), at, id)
                .update();
    }

    /** Попыток отправки в группы с момента since — для лимита номера в час. */
    public int attemptsSince(Instant since) {
        return jdbc.sql("select count(*) from delivery where status in ('SENT', 'FAILED') and updated_at >= ?")
                .param(since)
                .query(Integer.class)
                .single();
    }

    /** Закрывает рассылку: всё, что не отправлено, помечается пропущенным с причиной; возвращает сколько. */
    public int skipPending(String requestId, String reason, Instant at) {
        return jdbc.sql("update delivery set status = 'SKIPPED', error = ?, not_before = null, updated_at = ? "
                        + "where request_id = ? and status = 'PENDING'")
                .params(truncate(reason), at, requestId)
                .update();
    }

    public Optional<DeliveryRecord> nextPending(String requestId) {
        return jdbc.sql("select * from delivery where request_id = ? and status = 'PENDING' order by position limit 1")
                .param(requestId)
                .query(MAPPER)
                .optional();
    }

    public List<DeliveryRecord> findByRequest(String requestId) {
        return jdbc.sql("select * from delivery where request_id = ? order by position").param(requestId).query(MAPPER).list();
    }

    public List<DeliveryRecord> findByStatus(DeliveryStatus status) {
        return jdbc.sql("select * from delivery where status = ? order by request_id, position").param(status.name()).query(MAPPER).list();
    }

    public void updateStatus(long id, DeliveryStatus status, String error, Instant at) {
        jdbc.sql("update delivery set status = ?, error = ?, not_before = null, updated_at = ? where id = ?")
                .params(status.name(), truncate(error), at, id)
                .update();
    }

    /** Puts every failed send of the request back as pending; returns how many. */
    public int retryFailed(String requestId, Instant at) {
        return jdbc.sql("update delivery set status = 'PENDING', attempts = 0, error = null, updated_at = ? where request_id = ? and status = 'FAILED'")
                .params(at, requestId)
                .update();
    }

    public Progress progress(String requestId) {
        return jdbc.sql("""
                        select count(*) as total,
                               coalesce(sum(case when status = 'SENT' then 1 else 0 end), 0) as sent,
                               coalesce(sum(case when status = 'FAILED' then 1 else 0 end), 0) as failed,
                               coalesce(sum(case when status = 'SKIPPED' then 1 else 0 end), 0) as skipped,
                               coalesce(sum(case when status in ('PENDING', 'SENDING') then 1 else 0 end), 0) as pending
                        from delivery where request_id = ?""")
                .param(requestId)
                .query((rs, n) -> new Progress(rs.getInt("total"), rs.getInt("sent"), rs.getInt("failed"), rs.getInt("skipped"), rs.getInt("pending")))
                .single();
    }

    private static String truncate(String value) {
        return value == null || value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    public record Progress(int total, int sent, int failed, int skipped, int pending) {

        public String sheetText() {
            return sent + " / " + total;
        }
    }
}
