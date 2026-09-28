package kz.inkar.wasender.risk;

import java.util.List;

public enum RiskType {
    GROUP_REMOVED,
    SEND_FAILED,
    DISCONNECTED,
    LOGGED_OUT,
    BANNED,
    RISK_STOP,
    RESUMED;

    public static final List<RiskType> SIGNALS = List.of(GROUP_REMOVED, SEND_FAILED, DISCONNECTED, LOGGED_OUT, BANNED);
}
