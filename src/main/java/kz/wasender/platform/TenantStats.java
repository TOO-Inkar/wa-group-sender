package kz.wasender.platform;

import kz.wasender.dispatch.DispatcherState;
import org.jspecify.annotations.Nullable;

public record TenantStats(String session, @Nullable String account, String dispatcher, long activeGroups, int sentToday, int sentLastHour,
                          int queueLength, boolean stoppedByRisk) {
    public static final String STOPPED_SESSION = "STOPPED";
    public static final TenantStats STOPPED = new TenantStats(STOPPED_SESSION, null, DispatcherState.STOPPED.label(), 0, 0, 0, 0, false);
}
