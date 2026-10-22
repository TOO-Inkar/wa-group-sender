package kz.wasender.campaign;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;

public record Schedule(RepeatMode mode, LocalTime start, LocalTime end, Integer intervalMinutes) {
    public static final int MIN_INTERVAL_MINUTES = 30;

    public Schedule {
        if (mode == null) {
            throw new IllegalArgumentException("не указано, как повторять заявку");
        }
        if (mode != RepeatMode.ONCE && start == null) {
            throw new IllegalArgumentException("для повтора нужно время первой отправки");
        }
        if (mode == RepeatMode.INTERVAL) {
            if (intervalMinutes == null || intervalMinutes < MIN_INTERVAL_MINUTES) {
                throw new IllegalArgumentException("повтор не чаще чем раз в " + MIN_INTERVAL_MINUTES + " минут");
            }
            if (end != null && !end.isAfter(start)) {
                throw new IllegalArgumentException("время окончания должно быть позже времени начала");
            }
        }
    }

    public ZonedDateTime nextAfter(ZonedDateTime after, LocalTime windowEnd, boolean weekends) {
        return switch (mode) {
            case ONCE -> null;
            case DAILY -> nextDay(after, weekends, start, true);
            case INTERVAL -> nextInterval(after, end == null ? windowEnd : end, weekends);
        };
    }

    public ZonedDateTime first(ZonedDateTime now, LocalTime windowEnd, boolean weekends) {
        if (mode == RepeatMode.ONCE) {
            if (start == null) {
                return now;
            }
            var today = now.with(start);
            return today.isBefore(now) ? nextDay(now, weekends, start, false) : skipWeekend(today, weekends);
        }
        return nextAfter(now.minusNanos(1), windowEnd, weekends);
    }

    private ZonedDateTime nextInterval(ZonedDateTime after, LocalTime last, boolean weekends) {
        var day = after.toLocalDate().atStartOfDay(after.getZone());
        if (workday(day, weekends)) {
            for (var t = day.with(start); !t.toLocalTime().isAfter(last) && t.toLocalDate().equals(day.toLocalDate());
                 t = t.plusMinutes(intervalMinutes)) {
                if (t.isAfter(after)) {
                    return t;
                }
            }
        }
        return nextDay(after, weekends, start, false);
    }

    private static ZonedDateTime nextDay(ZonedDateTime after, boolean weekends, LocalTime time, boolean sameDay) {
        var candidate = after.with(time);
        if (!sameDay || !candidate.isAfter(after)) {
            candidate = candidate.plusDays(1);
        }
        return skipWeekend(candidate, weekends);
    }

    private static ZonedDateTime skipWeekend(ZonedDateTime moment, boolean weekends) {
        var candidate = moment;
        while (!workday(candidate, weekends)) {
            candidate = candidate.plusDays(1);
        }
        return candidate;
    }

    private static boolean workday(ZonedDateTime moment, boolean weekends) {
        var day = moment.getDayOfWeek();
        return weekends || (day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY);
    }
}
