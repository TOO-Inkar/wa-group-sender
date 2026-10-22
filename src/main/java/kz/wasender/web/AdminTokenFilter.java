package kz.wasender.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kz.wasender.config.SecurityProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;

@Component
public class AdminTokenFilter extends OncePerRequestFilter {

    private final SecurityProperties properties;
    private final SessionTokens sessions;

    @Autowired
    public AdminTokenFilter(SecurityProperties properties, SessionTokens sessions) {
        this.properties = properties;
        this.sessions = sessions;
    }

    public AdminTokenFilter(SecurityProperties properties) {
        this(properties, new SessionTokens(properties, Clock.systemUTC()));
    }

    /** Вход: токен в заголовке (API, curl) или cookie сессии со страницы входа. */
    static boolean authorized(HttpServletRequest request, SecurityProperties properties, SessionTokens sessions) {
        var expected = properties.adminToken();
        if (expected == null || expected.isBlank()) {
            return false;
        }
        var provided = request.getHeader(properties.header());
        if (provided != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
            return true;
        }
        var cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (SessionTokens.COOKIE.equals(cookie.getName()) && sessions.valid(cookie.getValue())) {
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        var path = request.getRequestURI();
        return !(path.startsWith("/api/admin") || path.startsWith("/api/qr") || path.startsWith("/api/groups"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        var expected = properties.adminToken();
        if (expected == null || expected.isBlank()) {
            reject(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "ADMIN_TOKEN is not configured");
            return;
        }
        if (!authorized(request, properties, sessions)) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "invalid or missing " + properties.header());
            return;
        }
        chain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
