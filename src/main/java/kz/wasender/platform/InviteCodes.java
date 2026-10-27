package kz.wasender.platform;

import java.security.SecureRandom;
import java.util.HexFormat;

public final class InviteCodes {
    private static final int BYTES = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    private InviteCodes() {
    }

    public static String random() {
        var bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
