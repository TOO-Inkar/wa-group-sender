package kz.wasender.web;

import kz.wasender.config.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class AdminTokenFilterTest {
    private static MockHttpServletResponse call(String token, String path, String header) throws Exception {
        var filter = new AdminTokenFilter(new SecurityProperties(token, "X-Admin-Token", "admin", null, java.time.Duration.ofDays(30)));
        var request = new MockHttpServletRequest("GET", path);
        if (header != null) {
            request.addHeader("X-Admin-Token", header);
        }
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void protectedEndpointsRequireToken() throws Exception {
        assertThat(call("secret", "/api/admin/resume", null).getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/qr", "wrong").getStatus()).isEqualTo(401);
        assertThat(call("secret", "/api/groups", "secret").getStatus()).isEqualTo(200);
    }

    @Test
    void healthIsOpen() throws Exception {
        assertThat(call("secret", "/api/health", null).getStatus()).isEqualTo(200);
    }

    @Test
    void adminPageIsOpen() throws Exception {
        assertThat(call("secret", "/", null).getStatus()).isEqualTo(200);
        assertThat(call("secret", "/app.js", null).getStatus()).isEqualTo(200);
    }

    @Test
    void missingConfiguredTokenLocksAdminApi() throws Exception {
        assertThat(call("", "/api/admin/pause", "").getStatus()).isEqualTo(503);
    }
}
