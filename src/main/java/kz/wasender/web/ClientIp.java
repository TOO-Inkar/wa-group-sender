package kz.wasender.web;

import jakarta.servlet.http.HttpServletRequest;

final class ClientIp {
    private static final String HEADER = "X-Real-IP";

    private ClientIp() {
    }

    static String of(HttpServletRequest request) {
        var real = request.getHeader(HEADER);
        return real == null || real.isBlank() ? request.getRemoteAddr() : real.strip();
    }
}
