package kz.wasender.campaign;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

public record Schedule(RepeatMode mode, LocalTime start, LocalTime end, Integer intervalMinutes, List<LocalTime> extraTimes,
                       boolean anyTime) {
    public static final int MIN_INTERVAL_MINUTES = 30;
    public static final int MAX_EXTRA_TIMES = 3;

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
        extraTimes = extraTimes == null ? List.of() : extraTimes.stream().filter(Objects::nonNull).distinct().sorted().toList();
        if (!extraTimes.isEmpty()) {
            if (mode == RepeatMode.ONCE) {
                throw new IllegalArgumentException("доп. время бывает только у повторяющейся заявки");
            }
            if (extraTimes.size() > MAX_EXTRA_TIMES) {
                throw new IllegalArgumentException("доп. время — не больше " + MAX_EXTRA_TIMES + " раз в день");
            }
        }
    }

    public Schedule(RepeatMode mode, LocalTime start, LocalTime end, Integer intervalMinutes) {
        this(mode, start, end, intervalMinutes, List.of(), false);
    }

    public ZonedDateTime nextAfter(ZonedDateTime after, LocalTime windowEnd, boolean weekends) {
        var base = switch (mode) {
            case ONCE -> null;
            case DAILY -> nextDay(after, weekends, start, true);
            case INTERVAL -> nextInterval(after, end == null ? windowEnd : end, weekends);
        };
        return Stream.concat(Stream.ofNullable(base), extraTimes.stream().map(time -> nextDay(after, weekends, time, true)))
                .min(Comparator.naturalOrder())
                .orElse(null);
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

    // «Сейчас» без своего времени шлёт в общем окне (null); повтор — с самой ранней отправки дня.
    public LocalTime windowStart() {
        if (anyTime) {
            return LocalTime.MIDNIGHT;
        }
        if (start == null) {
            return null;
        }
        return extraTimes.isEmpty() || extraTimes.getFirst().isAfter(start) ? start : extraTimes.getFirst();
    }

    public LocalTime windowEnd() {
        return anyTime ? LocalTime.MIDNIGHT : end;
    }

    public void requireExtraTimesBefore(LocalTime windowEnd) {
        var last = end == null ? windowEnd : end;
        if (!anyTime && !extraTimes.isEmpty() && !extraTimes.getLast().isBefore(last)) {
            throw new IllegalArgumentException("доп. время " + extraTimes.getLast() + " позже конца окна " + last
                    + " — уберите его или включите «Слать и вне рабочего окна»");
        }
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
