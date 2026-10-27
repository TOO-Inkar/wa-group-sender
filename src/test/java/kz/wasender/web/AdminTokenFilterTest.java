package kz.wasender.web;

import kz.wasender.config.PlatformProperties;
import kz.wasender.config.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class AdminTokenFilterTest {
    private static MockHttpServletResponse call(String token, String path, String header) throws Exception {
        return call(token, path, header, "", "localhost");
    }

    private static MockHttpServletResponse call(String token, String path, String header, String platformHost, String host) throws Exception {
        var security = new SecurityProperties(token, "X-Admin-Token", "admin", null, Duration.ofDays(30));
        var authenticator = new Authenticator(security, new SessionTokens(security, Clock.systemUTC()), null);
        var platform = new PlatformProperties(platformHost, "", "", "", "", "");
        var filter = new AdminTokenFilter(security, platform, authenticator,
                new CloudflareAccess(platform, JsonMapper.builder().build(), Clock.systemUTC(), uri -> "{\"keys\":[]}"));
        var request = new MockHttpServletRequest("GET", path);
        request.setServerName(host);
        if (header != null) {
            request.addHeader("X-Admin-Token", header);
        }
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void protectedEndpointsRequireCredentials() throws Exception {
        assertThat(call("secret", "/api/admin/resume", null).getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/qr", "wrong").getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/groups", null).getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/platform/tenants", "wrong").getStatus()).isEqualTo(401);
    }

    @Test
    void healthIsOpen() throws Exception {
        assertThat(call("secret", "/api/health", null).getStatus()).isEqualTo(200);
        assertThat(call("secret", "/api/auth/me", null).getStatus()).isEqualTo(200);
    }

    @Test
    void adminPageIsOpen() throws Exception {
        assertThat(call("secret", "/", null).getStatus()).isEqualTo(200);
        assertThat(call("secret", "/app.js", null).getStatus()).isEqualTo(200);
        assertThat(call("secret", "/api/platformer", null).getStatus()).isEqualTo(200);
    }

    @Test
    void missingConfiguredTokenLocksAdminApi() throws Exception {
        assertThat(call("", "/api/admin/pause", "").getStatus()).isEqualTo(503);
    }

    @Test
    void platformApiIsHiddenOnOtherHosts() throws Exception {
        assertThat(call("secret", "/api/platform/tenants", null, "admin.example.kz", "app.example.kz").getStatus()).isEqualTo(404);
        assertThat(call("secret", "/api/platform/tenants", null, "admin.example.kz", "ADMIN.example.kz").getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/admin/health", null, "admin.example.kz", "app.example.kz").getStatus()).isEqualTo(401);
    }
}
