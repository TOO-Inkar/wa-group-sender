package kz.wasender.risk;

import java.util.List;

public enum RiskType {
    GROUP_REMOVED,
    SEND_FAILED,
    DISCONNECTED,
    LOGGED_OUT,
    BANNED,
    RISK_STOP,
    RESUMED;

    // DISCONNECTED пишется для истории, но не считается: обрыв сети не говорит об ограничении номера.
    public static final List<RiskType> SIGNALS = List.of(GROUP_REMOVED, SEND_FAILED, LOGGED_OUT, BANNED);
}
