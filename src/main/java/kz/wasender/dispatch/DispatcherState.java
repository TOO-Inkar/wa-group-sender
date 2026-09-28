package kz.wasender.dispatch;

import java.util.Locale;

public enum DispatcherState {
    STARTING,
    IDLE,
    RUNNING,
    PAUSED,
    OUTSIDE_WINDOW,
    DAILY_LIMIT_REACHED,
    WAITING_SESSION,
    NO_ACTIVE_GROUPS,
    STOPPED_BY_RISK,
    STOPPED;

    public String label() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
