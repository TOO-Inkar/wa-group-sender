package kz.inkar.wasender.dispatch;

import kz.inkar.wasender.config.DispatchProperties;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.ZonedDateTime;

@Component
public class WorkWindow {

    private final DispatchProperties properties;
    private final Clock clock;

    public WorkWindow(DispatchProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public boolean isOpenNow() {
        return isOpen(ZonedDateTime.now(clock));
    }

    public boolean isOpen(ZonedDateTime moment) {
        var day = moment.getDayOfWeek();
        if (!properties.weekendsEnabled() && (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY)) {
            return false;
        }
        var time = moment.toLocalTime();
        var start = properties.windowStart();
        var end = properties.windowEnd();
        if (start.equals(end)) {
            return true;
        }
        if (start.isBefore(end)) {
            return !time.isBefore(start) && time.isBefore(end);
        }
        return !time.isBefore(start) || time.isBefore(end);
    }
}
