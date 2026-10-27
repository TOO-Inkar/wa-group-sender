package kz.wasender.web;

import kz.wasender.config.PlatformProperties;
import kz.wasender.config.SecurityProperties;
import kz.wasender.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CloudflareAccessTest {
    private static final String TEAM = "team.cloudflareaccess.com";
    private static final String AUD = "aud-123";
    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    private final MutableClock clock = new MutableClock(LocalDateTime.of(2026, 10, 27, 12, 0));
    private final List<URI> fetches = new ArrayList<>();
    private KeyPair key;
    private KeyPair other;
    private String jwks;
    private CloudflareAccess access;

    @BeforeEach
    void setUp() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        key = generator.generateKeyPair();
        other = generator.generateKeyPair();
        jwks = jwks("k1", key);
        access = new CloudflareAccess(new PlatformProperties("admin.example.kz", "", TEAM, AUD, "", ""), JsonMapper.builder().build(), clock, uri -> {
            fetches.add(uri);
            return jwks;
        });
    }

    private static String jwks(String kid, KeyPair pair) {
        var rsa = (RSAPublicKey) pair.getPublic();
        return "{\"keys\":[{\"kty\":\"RSA\",\"alg\":\"RS256\",\"kid\":\"%s\",\"n\":\"%s\",\"e\":\"%s\"}]}"
                .formatted(kid, unsigned(rsa.getModulus()), unsigned(rsa.getPublicExponent()));
    }

    private static String unsigned(BigInteger value) {
        var bytes = value.toByteArray();
        if (bytes[0] == 0) {
            bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        }
        return URL.encodeToString(bytes);
    }

    private String token(String kid, KeyPair pair, String claims) throws Exception {
        var header = URL.encodeToString(("{\"alg\":\"RS256\",\"kid\":\"" + kid + "\"}").getBytes(StandardCharsets.UTF_8));
        var payload = URL.encodeToString(claims.getBytes(StandardCharsets.UTF_8));
        var signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(pair.getPrivate());
        signature.update((header + "." + payload).getBytes(StandardCharsets.US_ASCII));
        return header + "." + payload + "." + URL.encodeToString(signature.sign());
    }

    private String claims(String aud, String iss, long expOffset) {
        var now = clock.instant().getEpochSecond();
        return "{\"aud\":%s,\"iss\":\"%s\",\"exp\":%d,\"nbf\":%d,\"email\":\"owner@example.kz\"}".formatted(aud, iss, now + expOffset, now - 10);
    }

    private String good() throws Exception {
        return token("k1", key, claims("[\"" + AUD + "\"]", "https://" + TEAM, 600));
    }

    @Test
    void acceptsAValidAssertionAndCachesTheKeys() throws Exception {
        assertThat(access.valid(good())).isTrue();
        assertThat(access.valid(token("k1", key, claims("\"" + AUD + "\"", "https://" + TEAM, 600)))).isTrue();
        assertThat(fetches).containsExactly(URI.create("https://" + TEAM + "/cdn-cgi/access/certs"));
    }

    @Test
    void rejectsWrongAudienceIssuerExpiryOrSignature() throws Exception {
        assertThat(access.valid(token("k1", key, claims("[\"other\"]", "https://" + TEAM, 600)))).isFalse();
        assertThat(access.valid(token("k1", key, claims("[\"" + AUD + "\"]", "https://evil.example", 600)))).isFalse();
        assertThat(access.valid(token("k1", key, claims("[\"" + AUD + "\"]", "https://" + TEAM, -120)))).isFalse();
        assertThat(access.valid(token("k1", key, claims("[\"" + AUD + "\"]", "https://" + TEAM, -30)))).isTrue();
        assertThat(access.valid(token("k1", other, claims("[\"" + AUD + "\"]", "https://" + TEAM, 600)))).isFalse();
        assertThat(access.valid(good() + "x")).isFalse();
        assertThat(access.valid("not-a-jwt")).isFalse();
        assertThat(access.valid(null)).isFalse();
        var unsignedHeader = URL.encodeToString("{\"alg\":\"none\",\"kid\":\"k1\"}".getBytes(StandardCharsets.UTF_8));
        var parts = good().split("\\.");
        assertThat(access.valid(unsignedHeader + "." + parts[1] + ".")).isFalse();
    }

    @Test
    void unknownKidRefreshesTheKeysAtMostEveryFiveMinutes() throws Exception {
        assertThat(access.valid(good())).isTrue();
        jwks = jwks("k2", other);
        var rotated = token("k2", other, claims("[\"" + AUD + "\"]", "https://" + TEAM, 3600));

        assertThat(access.valid(rotated)).isFalse();
        assertThat(fetches).hasSize(1);
        clock.advance(Duration.ofMinutes(5));
        assertThat(access.valid(rotated)).isTrue();
        assertThat(fetches).hasSize(2);
    }

    @Test
    void platformApiAndPlatformLoginRequireTheAssertion() throws Exception {
        var security = new SecurityProperties("secret", "X-Admin-Token", "admin", null, Duration.ofDays(30));
        var platform = new PlatformProperties("admin.example.kz", "", TEAM, AUD, "", "");
        var filter = new AdminTokenFilter(security, platform, new Authenticator(security, new SessionTokens(security, clock), null), access);

        var denied = new MockHttpServletRequest("GET", "/api/platform/tenants");
        denied.setServerName("admin.example.kz");
        var deniedResponse = new MockHttpServletResponse();
        filter.doFilter(denied, deniedResponse, new MockFilterChain());
        assertThat(deniedResponse.getStatus()).isEqualTo(403);
        assertThat(deniedResponse.getContentAsString(StandardCharsets.UTF_8)).contains(CloudflareAccess.DENIED);

        var allowed = new MockHttpServletRequest("GET", "/api/platform/tenants");
        allowed.setServerName("admin.example.kz");
        allowed.addHeader(CloudflareAccess.HEADER, good());
        var allowedResponse = new MockHttpServletResponse();
        filter.doFilter(allowed, allowedResponse, new MockFilterChain());
        assertThat(allowedResponse.getStatus()).isEqualTo(401);

        var tenantApi = new MockHttpServletRequest("GET", "/api/admin/health");
        tenantApi.setServerName("app.example.kz");
        var tenantResponse = new MockHttpServletResponse();
        filter.doFilter(tenantApi, tenantResponse, new MockFilterChain());
        assertThat(tenantResponse.getStatus()).isEqualTo(401);

        var auth = new AuthController(null, null, null, null, null, null, null, platform, access, clock);
        var login = new MockHttpServletRequest("POST", "/api/auth/login");
        login.setServerName("admin.example.kz");
        assertThat(auth.login(new AuthController.Login("admin", "x"), login).getStatusCode().value()).isEqualTo(403);
    }
}
