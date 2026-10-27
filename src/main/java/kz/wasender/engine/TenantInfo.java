package kz.wasender.engine;

import org.slf4j.MDC;

import java.nio.file.Path;

public record TenantInfo(long id, String key, String name, boolean legacy) {
    public static final String MDC_KEY = "tenant";

    public Path file(Path base) {
        return legacy ? base : base.getParent().resolve(key).resolve(base.getFileName());
    }

    public Path dir(Path base) {
        return legacy ? base : base.resolve(key);
    }

    public String threadName(String name) {
        return name + "-" + key;
    }

    public Runnable withMdc(Runnable task) {
        return () -> {
            MDC.put(MDC_KEY, key);
            try {
                task.run();
            } finally {
                MDC.remove(MDC_KEY);
            }
        };
    }
}
