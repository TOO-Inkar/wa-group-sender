package kz.wasender.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kz.wasender.config.PlatformProperties;
import kz.wasender.config.SecurityProperties;
import kz.wasender.engine.CurrentTenant;
import kz.wasender.platform.Actor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class AdminTokenFilter extends OncePerRequestFilter {
    private static final List<String> TENANT_PATHS = List.of("/api/admin", "/api/qr", "/api/groups");
    private static final String PLATFORM_PATH = "/api/platform";

    private final SecurityProperties properties;
    private final PlatformProperties platform;
    private final Authenticator authenticator;
    private final CloudflareAccess access;

    public AdminTokenFilter(SecurityProperties properties, PlatformProperties platform, Authenticator authenticator, CloudflareAccess access) {
        this.properties = properties;
        this.platform = platform;
        this.authenticator = authenticator;
        this.access = access;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        var path = request.getRequestURI();
        return !platformPath(path) && TENANT_PATHS.stream().noneMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        var platformRequest = platformPath(request.getRequestURI());
        if (platformRequest && platform.hostRestricted() && !platform.platformHost(request.getServerName())) {
            reject(response, HttpServletResponse.SC_NOT_FOUND, "Not found");
            return;
        }
        if (platformRequest && !access.allows(request)) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, CloudflareAccess.DENIED);
            return;
        }
        if (!authenticator.configured()) {
            reject(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "ADMIN_TOKEN is not configured");
            return;
        }
        var actor = authenticator.authenticate(request);
        if (actor.isEmpty()) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "invalid or missing " + properties.header());
            return;
        }
        request.setAttribute(Actor.ATTRIBUTE, actor.get());
        if (platformRequest) {
            if (!actor.get().superadmin()) {
                reject(response, HttpServletResponse.SC_FORBIDDEN, "Доступно только суперадмину");
                return;
            }
        } else {
            var tenant = actor.get().tenant();
            if (tenant == null) {
                reject(response, HttpServletResponse.SC_FORBIDDEN, "Кабинет недоступен");
                return;
            }
            CurrentTenant.bind(request, tenant.id());
        }
        chain.doFilter(request, response);
    }

    private static boolean platformPath(String path) {
        return path.equals(PLATFORM_PATH) || path.startsWith(PLATFORM_PATH + "/");
    }

    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
