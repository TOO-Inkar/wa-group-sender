package kz.wasender.engine;

import java.nio.file.Path;

public record TenantInfo(long id, String key, String name, boolean legacy) {
    public Path file(Path base) {
        return legacy ? base : base.getParent().resolve(key).resolve(base.getFileName());
    }

    public Path dir(Path base) {
        return legacy ? base : base.resolve(key);
    }
}
