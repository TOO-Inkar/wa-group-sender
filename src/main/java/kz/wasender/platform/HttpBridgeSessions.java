package kz.wasender.platform;

import kz.wasender.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@Profile("!fake")
public class HttpBridgeSessions implements BridgeSessions {
    private static final Logger log = LoggerFactory.getLogger(HttpBridgeSessions.class);

    private final RestClient client;

    public HttpBridgeSessions(WhatsAppProperties properties) {
        this.client = RestClient.builder().baseUrl(properties.bridgeUrl().toString()).build();
    }

    @Override
    public void disconnect(String key) {
        try {
            client.post().uri("/s/{key}/disconnect", key).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("BRIDGE disconnect session={} failed: {}", key, e.toString());
        }
    }

    @Override
    public void delete(String key) {
        client.delete().uri("/s/{key}", key).retrieve().toBodilessEntity();
    }
}
