package kz.wasender.web;

import jakarta.servlet.http.HttpServletRequest;
import kz.wasender.config.PlatformProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class CloudflareAccess {
    public static final String HEADER = "Cf-Access-Jwt-Assertion";
    public static final String DENIED = "Нужен вход через Cloudflare Access";
    private static final Logger log = LoggerFactory.getLogger(CloudflareAccess.class);
    private static final Duration REFRESH_INTERVAL = Duration.ofMinutes(5);
    private static final Duration SKEW = Duration.ofSeconds(60);
    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(10);
    private static final String ALGORITHM = "RS256";
    private static final String CERTS_PATH = "/cdn-cgi/access/certs";

    private final PlatformProperties properties;
    private final JsonMapper json;
    private final Clock clock;
    private final Function<URI, String> fetcher;
    private Map<String, PublicKey> keys = Map.of();
    private Instant fetchedAt;

    @Autowired
    public CloudflareAccess(PlatformProperties properties, JsonMapper json, Clock clock) {
        this(properties, json, clock, httpFetcher());
    }

    CloudflareAccess(PlatformProperties properties, JsonMapper json, Clock clock, Function<URI, String> fetcher) {
        this.properties = properties;
        this.json = json;
        this.clock = clock;
        this.fetcher = fetcher;
    }

    public boolean allows(HttpServletRequest request) {
        return !properties.accessRequired() || valid(request.getHeader(HEADER));
    }

    boolean valid(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            var parts = token.strip().split("\\.");
            if (parts.length != 3) {
                return false;
            }
            var header = decode(parts[0]);
            if (!ALGORITHM.equals(header.path("alg").asString())) {
                return false;
            }
            var key = key(header.path("kid").asString());
            if (key == null || !signed(parts, key)) {
                return false;
            }
            return claimsValid(decode(parts[1]));
        } catch (RuntimeException | GeneralSecurityException e) {
            log.warn("ACCESS jwt rejected: {}", e.toString());
            return false;
        }
    }

    private boolean claimsValid(JsonNode claims) {
        var now = Instant.now(clock);
        var issuer = "https://" + teamDomain();
        if (!issuer.equals(claims.path("iss").asString())) {
            return false;
        }
        var exp = claims.path("exp");
        if (!exp.isNumber() || Instant.ofEpochSecond(exp.asLong()).plus(SKEW).isBefore(now)) {
            return false;
        }
        var nbf = claims.path("nbf");
        if (nbf.isNumber() && Instant.ofEpochSecond(nbf.asLong()).minus(SKEW).isAfter(now)) {
            return false;
        }
        var aud = claims.path("aud");
        var expected = properties.accessAud().strip();
        if (aud.isArray()) {
            for (var i = 0; i < aud.size(); i++) {
                if (expected.equals(aud.get(i).asString())) {
                    return true;
                }
            }
            return false;
        }
        return expected.equals(aud.asString());
    }

    private static boolean signed(String[] parts, PublicKey key) throws GeneralSecurityException {
        var signature = Signature.getInstance("SHA256withRSA");
        signature.initVerify(key);
        signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        return signature.verify(Base64.getUrlDecoder().decode(parts[2]));
    }

    private synchronized PublicKey key(String kid) throws GeneralSecurityException {
        var key = keys.get(kid);
        var now = Instant.now(clock);
        if (key == null && (fetchedAt == null || !now.isBefore(fetchedAt.plus(REFRESH_INTERVAL)))) {
            fetchedAt = now;
            keys = fetchKeys();
            key = keys.get(kid);
        }
        return key;
    }

    private Map<String, PublicKey> fetchKeys() throws GeneralSecurityException {
        var body = json.readTree(fetcher.apply(URI.create("https://" + teamDomain() + CERTS_PATH)));
        var factory = KeyFactory.getInstance("RSA");
        var result = new HashMap<String, PublicKey>();
        var list = body.path("keys");
        for (var i = 0; i < list.size(); i++) {
            var jwk = list.get(i);
            if (!"RSA".equals(jwk.path("kty").asString())) {
                continue;
            }
            var spec = new RSAPublicKeySpec(unsigned(jwk.path("n").asString()), unsigned(jwk.path("e").asString()));
            result.put(jwk.path("kid").asString(), factory.generatePublic(spec));
        }
        log.info("ACCESS loaded {} signing keys", result.size());
        return Map.copyOf(result);
    }

    private JsonNode decode(String part) {
        return json.readTree(new String(Base64.getUrlDecoder().decode(part), StandardCharsets.UTF_8));
    }

    private String teamDomain() {
        return properties.accessTeamDomain().strip();
    }

    private static BigInteger unsigned(String base64Url) {
        return new BigInteger(1, Base64.getUrlDecoder().decode(base64Url));
    }

    private static Function<URI, String> httpFetcher() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(FETCH_TIMEOUT).build());
        factory.setReadTimeout(FETCH_TIMEOUT);
        var client = RestClient.builder().requestFactory(factory).build();
        return uri -> client.get().uri(uri).retrieve().body(String.class);
    }
}
