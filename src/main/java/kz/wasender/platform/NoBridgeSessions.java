package kz.wasender.platform;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("fake")
public class NoBridgeSessions implements BridgeSessions {
    private static final String FAKE_IP = "203.0.113.7";
    private static final String FAKE_COUNTRY = "KZ";

    @Override
    public void disconnect(String key) {
    }

    @Override
    public void delete(String key) {
    }

    @Override
    public ProxyCheck checkProxy(String proxyUrl) {
        return new ProxyCheck(true, FAKE_IP, FAKE_COUNTRY, null, null, true, null);
    }
}
