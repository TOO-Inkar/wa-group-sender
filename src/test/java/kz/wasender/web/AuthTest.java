package kz.wasender.web;

import kz.wasender.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;

class AuthTest extends IntegrationTest {

    @Autowired
    AuthController auth;
    @Autowired
    AdminTokenFilter filter;

    private int filtered(Cookie cookie) throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/admin/campaigns");
        if (cookie != null) {
            request.setCookies(cookie);
        }
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(200));
        return response.getStatus();
    }

    @Test
    void loginWithTheHtpasswdHashGivesASessionCookieThatOpensTheApi() throws Exception {
        var response = auth.login(new AuthController.Login("admin", "test-password"), new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        var header = response.getHeaders().getFirst("Set-Cookie");
        assertThat(header).startsWith(SessionTokens.COOKIE + "=").contains("HttpOnly").contains("Secure").contains("SameSite=Strict");
        var value = header.substring(header.indexOf('=') + 1, header.indexOf(';'));

        assertThat(filtered(new Cookie(SessionTokens.COOKIE, value))).isEqualTo(200);
        assertThat(filtered(new Cookie(SessionTokens.COOKIE, value + "x"))).isEqualTo(401);
        assertThat(filtered(null)).isEqualTo(401);
    }

    @Test
    void wrongPasswordIsRejectedAndRepeatedFailuresAreThrottled() {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "203.0.113.7");

        assertThat(auth.login(new AuthController.Login("admin", "wrong"), request).getStatusCode().value()).isEqualTo(401);
        assertThat(auth.login(new AuthController.Login("root", "test-password"), request).getStatusCode().value()).isEqualTo(401);
        for (var i = 0; i < 8; i++) {
            auth.login(new AuthController.Login("admin", "wrong"), request);
        }
        assertThat(auth.login(new AuthController.Login("admin", "test-password"), request).getStatusCode().value()).isEqualTo(429);
        assertThat(auth.login(new AuthController.Login("admin", "test-password"), new MockHttpServletRequest()).getStatusCode().value())
                .isEqualTo(200);
    }
}
