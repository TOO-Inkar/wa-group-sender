package kz.wasender.engine;

public interface Engine {
    TenantInfo info();

    <T> T bean(Class<T> type);
}
