package kz.wasender.engine;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Optional;
import java.util.function.Supplier;

public final class CurrentTenant {
    public static final String ATTRIBUTE = "wa.tenant";
    private static final ThreadLocal<Long> OVERRIDE = new ThreadLocal<>();

    private CurrentTenant() {
    }

    public static void bind(HttpServletRequest request, long tenantId) {
        request.setAttribute(ATTRIBUTE, tenantId);
    }

    public static <T> T callAs(long tenantId, Supplier<T> action) {
        var previous = OVERRIDE.get();
        OVERRIDE.set(tenantId);
        try {
            return action.get();
        } finally {
            if (previous == null) {
                OVERRIDE.remove();
            } else {
                OVERRIDE.set(previous);
            }
        }
    }

    public static Optional<Long> get() {
        var override = OVERRIDE.get();
        if (override != null) {
            return Optional.of(override);
        }
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                && attributes.getRequest().getAttribute(ATTRIBUTE) instanceof Long id) {
            return Optional.of(id);
        }
        return Optional.empty();
    }
}
