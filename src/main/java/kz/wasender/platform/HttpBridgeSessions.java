package kz.wasender.platform;

import kz.wasender.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@Component
@Profile("!fake")
public class HttpBridgeSessions implements BridgeSessions {
    private static final Logger log = LoggerFactory.getLogger(HttpBridgeSessions.class);
    private static final String NO_ANSWER = "мост не ответил на проверку";

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

    @Override
    public ProxyCheck checkProxy(String proxyUrl) {
        try {
            var result = client.post().uri("/proxy-check").contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("proxy", proxyUrl)).retrieve().body(ProxyCheck.class);
            return result == null ? ProxyCheck.failed(NO_ANSWER) : result;
        } catch (RestClientException e) {
            log.warn("BRIDGE proxy check failed: {}", e.getClass().getSimpleName());
            return ProxyCheck.failed(NO_ANSWER);
        }
    }
}
