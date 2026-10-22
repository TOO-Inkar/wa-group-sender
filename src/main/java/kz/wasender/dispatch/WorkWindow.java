package kz.wasender.dispatch;

import kz.wasender.config.DispatchProperties;
import kz.wasender.settings.SettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.function.Supplier;

@Component
public class WorkWindow {

    private final Supplier<DispatchProperties> properties;
    private final Clock clock;

    @Autowired
    public WorkWindow(SettingsService settings, Clock clock) {
        this.properties = settings::dispatch;
        this.clock = clock;
    }

    public WorkWindow(DispatchProperties properties, Clock clock) {
        this.properties = () -> properties;
        this.clock = clock;
    }

    public boolean isOpenNow() {
        return isOpen(ZonedDateTime.now(clock));
    }

    public boolean isOpen(ZonedDateTime moment) {
        var current = properties.get();
        return isOpen(moment, current.windowStart(), current.windowEnd());
    }

    /**
     * Окно отдельной рассылки: заявка по расписанию шлёт со своего времени старта до своего конца
     * (или до конца общего окна). Выходные — по общей настройке.
     */
    public boolean isOpenNow(LocalTime ownStart, LocalTime ownEnd) {
        if (ownStart == null) {
            return isOpenNow();
        }
        return isOpen(ZonedDateTime.now(clock), ownStart, ownEnd == null ? properties.get().windowEnd() : ownEnd);
    }

    public LocalTime end() {
        return properties.get().windowEnd();
    }

    public boolean weekendsEnabled() {
        return properties.get().weekendsEnabled();
    }

    private boolean isOpen(ZonedDateTime moment, LocalTime start, LocalTime end) {
        var day = moment.getDayOfWeek();
        if (!properties.get().weekendsEnabled() && (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY)) {
            return false;
        }
        var time = moment.toLocalTime();
        if (start.equals(end)) {
            return true;
        }
        if (start.isBefore(end)) {
            return !time.isBefore(start) && time.isBefore(end);
        }
        return !time.isBefore(start) || time.isBefore(end);
    }
}
