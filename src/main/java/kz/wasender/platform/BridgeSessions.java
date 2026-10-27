package kz.wasender.platform;

public interface BridgeSessions {
    void disconnect(String key);

    void delete(String key);
}
