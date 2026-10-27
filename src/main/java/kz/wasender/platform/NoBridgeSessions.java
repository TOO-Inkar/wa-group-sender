package kz.wasender.platform;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("fake")
public class NoBridgeSessions implements BridgeSessions {
    @Override
    public void disconnect(String key) {
    }

    @Override
    public void delete(String key) {
    }
}
