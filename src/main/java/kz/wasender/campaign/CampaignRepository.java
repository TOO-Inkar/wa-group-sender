package kz.wasender.campaign;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
public class CampaignRepository {
    private static final RowMapper<CampaignRecord> MAPPER = (rs, n) -> new CampaignRecord(
            rs.getString("id"),
            rs.getString("title"),
            rs.getString("draft"),
            rs.getString("message"),
            rs.getBoolean("targeted"),
            rs.getString("target_label"),
            new Schedule(RepeatMode.valueOf(rs.getString("repeat_mode")), rs.getObject("start_time", LocalTime.class),
                    rs.getObject("end_time", LocalTime.class), (Integer) rs.getObject("interval_minutes"),
                    parseTimes(rs.getString("extra_times")), rs.getBoolean("any_time")),
            rs.getBoolean("enabled"),
            rs.getBoolean("deleted"),
            rs.getObject("created_at", Instant.class),
            rs.getObject("updated_at", Instant.class),
            rs.getObject("next_run_at", Instant.class),
            rs.getObject("last_run_at", Instant.class));

    private final JdbcClient jdbc;

    public CampaignRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<CampaignRecord> find(String id) {
        return jdbc.sql("select * from campaign where id = ? and not deleted").param(id).query(MAPPER).optional();
    }

    public List<CampaignRecord> findAll() {
        return jdbc.sql("select * from campaign where not deleted order by created_at desc, id desc").query(MAPPER).list();
    }

    public List<CampaignRecord> findTargetedWithLabel(String label) {
        return jdbc.sql("select * from campaign where targeted and not deleted and target_label = ?").param(label).query(MAPPER).list();
    }

    public void retarget(String id, String label, Collection<String> targets, Instant at) {
        jdbc.sql("update campaign set target_label = ?, updated_at = ? where id = ?").params(label, at, id).update();
        replaceTargets(id, targets);
    }

    public List<String> findAllIds() {
        return jdbc.sql("select id from campaign").query(String.class).list();
    }

    public List<CampaignRecord> due(Instant now) {
        return jdbc.sql("select * from campaign where enabled and not deleted and next_run_at is not null and next_run_at <= ? order by next_run_at, id")
                .param(now).query(MAPPER).list();
    }

    public void insert(CampaignRecord campaign, Collection<String> targets) {
        var schedule = campaign.schedule();
        jdbc.sql("""
                        insert into campaign(id, title, draft, message, targeted, target_label, repeat_mode, start_time, end_time,
                            interval_minutes, extra_times, any_time, enabled, created_at, updated_at, next_run_at)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                .params(campaign.id(), campaign.title(), campaign.draft(), campaign.message(), campaign.targeted(), campaign.targetLabel(),
                        schedule.mode().name(), schedule.start(), schedule.end(), schedule.intervalMinutes(), formatTimes(schedule.extraTimes()),
                        schedule.anyTime(), campaign.enabled(), campaign.createdAt(), campaign.updatedAt(), campaign.nextRunAt())
                .update();
        replaceTargets(campaign.id(), targets);
    }

    public void update(CampaignRecord campaign, Collection<String> targets) {
        var schedule = campaign.schedule();
        jdbc.sql("""
                        update campaign set title = ?, draft = ?, message = ?, targeted = ?, target_label = ?, repeat_mode = ?,
                            start_time = ?, end_time = ?, interval_minutes = ?, extra_times = ?, any_time = ?, enabled = ?, updated_at = ?,
                            next_run_at = ?
                        where id = ?""")
                .params(campaign.title(), campaign.draft(), campaign.message(), campaign.targeted(), campaign.targetLabel(),
                        schedule.mode().name(), schedule.start(), schedule.end(), schedule.intervalMinutes(), formatTimes(schedule.extraTimes()),
                        schedule.anyTime(), campaign.enabled(), campaign.updatedAt(), campaign.nextRunAt(), campaign.id())
                .update();
        replaceTargets(campaign.id(), targets);
    }

    public void scheduled(String id, Instant lastRunAt, Instant nextRunAt, boolean enabled) {
        jdbc.sql("update campaign set last_run_at = coalesce(?, last_run_at), next_run_at = ?, enabled = ? where id = ?")
                .params(lastRunAt, nextRunAt, enabled, id).update();
    }

    public void setEnabled(String id, boolean enabled, Instant nextRunAt, Instant at) {
        jdbc.sql("update campaign set enabled = ?, next_run_at = ?, updated_at = ? where id = ?").params(enabled, nextRunAt, at, id).update();
    }

    public void markDeleted(String id, Instant at) {
        jdbc.sql("update campaign set deleted = true, enabled = false, next_run_at = null, updated_at = ? where id = ?").params(at, id).update();
    }

    public List<String> targets(String id) {
        return jdbc.sql("select group_jid from campaign_target where campaign_id = ? order by group_jid").param(id).query(String.class).list();
    }

    private static List<LocalTime> parseTimes(String value) {
        return value == null || value.isBlank() ? List.of() : Arrays.stream(value.split(",")).map(LocalTime::parse).toList();
    }

    private static String formatTimes(List<LocalTime> times) {
        return times.isEmpty() ? null : times.stream().map(LocalTime::toString).collect(Collectors.joining(","));
    }

    private void replaceTargets(String id, Collection<String> targets) {
        jdbc.sql("delete from campaign_target where campaign_id = ?").param(id).update();
        for (var jid : new LinkedHashSet<>(targets)) {
            jdbc.sql("insert into campaign_target(campaign_id, group_jid) values (?, ?)").params(id, jid).update();
        }
    }
}
