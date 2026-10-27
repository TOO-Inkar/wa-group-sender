package kz.wasender.web;

import jakarta.servlet.http.Cookie;
import kz.wasender.engine.CurrentTenant;
import kz.wasender.platform.AuditAction;
import kz.wasender.platform.AuditLog;
import kz.wasender.support.ApiTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AuthTest extends ApiTest {
    @Autowired
    AuditLog audit;

    private int adminApi(Cookie cookie) throws Exception {
        return status(perform(get("/api/admin/health").cookie(cookie)));
    }

    @Test
    void loginWithTheHtpasswdHashGivesASessionCookieThatOpensTheApi() throws Exception {
        var result = login(ADMIN, ADMIN_PASSWORD, "198.51.100.1");

        assertThat(status(result)).isEqualTo(200);
        var header = result.getResponse().getHeader("Set-Cookie");
        assertThat(header).startsWith(SessionTokens.COOKIE + "=").contains("HttpOnly").contains("Secure").contains("SameSite=Strict");
        assertThat(json(result, "$.authenticated")).isEqualTo(true);
        assertThat(json(result, "$.username")).isEqualTo(ADMIN);
        assertThat(json(result, "$.role")).isEqualTo("SUPERADMIN");
        assertThat(json(result, "$.tenant.id")).isEqualTo(1);
        assertThat(json(result, "$.tenant.name")).isEqualTo("Кабинет 1");

        var cookie = sessionOf(result);
        var ok = perform(get("/api/admin/health").cookie(cookie));
        assertThat(status(ok)).isEqualTo(200);
        assertThat(ok.getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(LEGACY_TENANT);
        assertThat(adminApi(new Cookie(SessionTokens.COOKIE, cookie.getValue() + "x"))).isEqualTo(401);
        assertThat(status(perform(get("/api/admin/health")))).isEqualTo(401);
        assertThat(audit.recent(null, 10)).extracting(e -> e.action()).contains(AuditAction.LOGIN);
    }

    @Test
    void meReportsAnonymousWithoutSessionAndLogoutClearsTheCookie() throws Exception {
        var anonymous = perform(get("/api/auth/me"));
        assertThat(status(anonymous)).isEqualTo(200);
        assertThat(json(anonymous, "$.authenticated")).isEqualTo(false);
        assertThat(json(anonymous, "$.role")).isNull();
        assertThat(json(anonymous, "$.tenant")).isNull();

        var logout = perform(post("/api/auth/logout"));
        assertThat(status(logout)).isEqualTo(204);
        assertThat(logout.getResponse().getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void wrongPasswordIsRejectedAndRepeatedFailuresAreThrottledPerIp() throws Exception {
        var ip = "203.0.113.7";
        assertThat(status(login(ADMIN, "wrong", ip))).isEqualTo(401);
        assertThat(status(login("root", ADMIN_PASSWORD, ip))).isEqualTo(401);
        for (var i = 0; i < 8; i++) {
            login(ADMIN, "wrong", ip);
        }
        var throttled = login(ADMIN, ADMIN_PASSWORD, ip);
        assertThat(status(throttled)).isEqualTo(429);
        assertThat((String) read(throttled, "$.message")).contains("10 минут");
        assertThat(status(login(ADMIN, ADMIN_PASSWORD, "203.0.113.8"))).isEqualTo(200);
        assertThat(audit.recent(null, 20)).filteredOn(e -> e.action() == AuditAction.LOGIN_FAILED).hasSize(10)
                .allSatisfy(e -> assertThat(e.ip()).isEqualTo(ip));
    }

    @Test
    void repeatedFailuresForOneLoginAreThrottledFromAnyIp() throws Exception {
        for (var i = 0; i < 10; i++) {
            assertThat(status(login(ADMIN, "wrong", "192.0.2." + i))).isEqualTo(401);
        }
        assertThat(status(login(ADMIN, ADMIN_PASSWORD, "192.0.2.200"))).isEqualTo(429);
        assertThat(status(login("ADMIN", ADMIN_PASSWORD, "192.0.2.201"))).isEqualTo(429);

        clock.advance(Duration.ofMinutes(11));
        assertThat(status(login(ADMIN, ADMIN_PASSWORD, "192.0.2.202"))).isEqualTo(200);
    }

    @Test
    void passwordChangeBumpsTheSessionVersionAndReissuesTheCookie() throws Exception {
        var old = admin();
        var other = admin();

        var tooShort = perform(post("/api/auth/password"), old, "{\"current\":\"test-password\",\"next\":\"short\"}");
        assertThat(status(tooShort)).isEqualTo(400);
        assertThat((String) read(tooShort, "$.message")).contains("не короче 8");
        var wrongCurrent = perform(post("/api/auth/password"), old, "{\"current\":\"nope\",\"next\":\"long-enough-1\"}");
        assertThat(status(wrongCurrent)).isEqualTo(400);

        var changed = perform(post("/api/auth/password"), old, "{\"current\":\"test-password\",\"next\":\"long-enough-1\"}");
        assertThat(status(changed)).isEqualTo(204);
        var renewed = sessionOf(changed);

        assertThat(adminApi(old)).isEqualTo(401);
        assertThat(adminApi(other)).isEqualTo(401);
        assertThat(adminApi(renewed)).isEqualTo(200);
        assertThat(status(login(ADMIN, ADMIN_PASSWORD, "198.51.100.9"))).isEqualTo(401);
        assertThat(status(login(ADMIN, "long-enough-1", "198.51.100.9"))).isEqualTo(200);
        assertThat(audit.recent(null, 20)).extracting(e -> e.action()).contains(AuditAction.PASSWORD_CHANGED);
        assertThat(status(perform(post("/api/auth/password").header("X-Real-IP", "1.1.1.1")
                .contentType("application/json").content("{\"current\":\"a\",\"next\":\"b\"}")))).isEqualTo(401);
    }

    @Test
    void scriptTokenActsAsSuperadminInTheRequestedTenant() throws Exception {
        var plain = perform(get("/api/admin/health").header("X-Admin-Token", "test-token"));
        assertThat(status(plain)).isEqualTo(200);
        assertThat(plain.getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(LEGACY_TENANT);

        var created = perform(post("/api/platform/tenants").header("X-Admin-Token", "test-token").contentType("application/json")
                .content("{\"name\":\"Второй\",\"login\":\"second\",\"password\":\"second-pass\"}"));
        assertThat(status(created)).isEqualTo(201);
        long id = ((Number) json(created, "$.id")).longValue();

        var scoped = perform(get("/api/groups").header("X-Admin-Token", "test-token").header("X-Tenant", Long.toString(id)));
        assertThat(scoped.getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(id);
        assertThat(status(perform(get("/api/admin/health").header("X-Admin-Token", "test-token").header("X-Tenant", "99")))).isEqualTo(403);
        assertThat(status(perform(get("/api/admin/health").header("X-Admin-Token", "wrong")))).isEqualTo(401);
        assertThat(List.of(json(perform(get("/api/auth/me").header("X-Admin-Token", "test-token")), "$.role"))).containsExactly("SUPERADMIN");
    }
}
