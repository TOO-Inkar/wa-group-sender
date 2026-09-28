package kz.inkar.wasender.dispatch;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public class DailyCounterRepository {

    private final JdbcClient jdbc;

    public DailyCounterRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public int sent(LocalDate day) {
        return jdbc.sql("select coalesce(max(sent), 0) from daily_counter where counter_date = ?").param(day).query(Integer.class).single();
    }

    public void increment(LocalDate day, Integer limit) {
        var updated = jdbc.sql("update daily_counter set sent = sent + 1, limit_value = ? where counter_date = ?").params(limit, day).update();
        if (updated == 0) {
            jdbc.sql("insert into daily_counter(counter_date, sent, limit_value) values (?, 1, ?)").params(day, limit).update();
        }
    }

    public Optional<LocalDate> firstSendDay() {
        return jdbc.sql("select min(counter_date) from daily_counter where sent > 0").query(LocalDate.class).optional();
    }
}
