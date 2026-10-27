package kz.wasender.platform;

import kz.wasender.support.ApiTest;
import kz.wasender.web.SessionTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@TestPropertySource(properties = {
        "app.platform.host=" + SeparateAdminTest.ADMIN_HOST,
        "app.platform.admin-username=" + SeparateAdminTest.BOSS,
        "app.platform.admin-password-hash=$2y$04$J/gjAAVfgm959wSWo/HQC.OaWkoTODjlZOxyO/OOdYbiVT/XF4/vO"})
class SeparateAdminTest extends ApiTest {
    static final String ADMIN_HOST = "admin.example.kz";
    static final String BOSS = "boss";

    @Autowired
    UserRepository users;

    private MvcResult loginOn(String host, String username) throws Exception {
        return perform(post("/api/auth/login").with(request -> {
                    request.setServerName(host);
                    return request;
                }).header("X-Real-IP", "198.51.100.30").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, ADMIN_PASSWORD)));
    }

    @Test
    void ownerLoginBecomesAMemberOfTheFirstCabinetAndAdminGetsItsOwnAccount() {
        var owner = users.findByLogin(ADMIN).orElseThrow();
        assertThat(owner.role()).isEqualTo(Role.MEMBER);
        assertThat(owner.tenantId()).isEqualTo(LEGACY_TENANT);
        var boss = users.findByLogin(BOSS).orElseThrow();
        assertThat(boss.role()).isEqualTo(Role.SUPERADMIN);
        assertThat(boss.tenantId()).isNull();
    }

    @Test
    void eachAccountSignsInOnlyOnItsOwnHost() throws Exception {
        var cabinet = loginOn("localhost", ADMIN);
        assertThat(status(cabinet)).isEqualTo(200);
        assertThat(json(cabinet, "$.role")).isEqualTo("MEMBER");
        assertThat(json(cabinet, "$.tenant.id")).isEqualTo((int) LEGACY_TENANT);
        assertThat(status(perform(get("/api/admin/health").cookie(sessionOf(cabinet))))).isEqualTo(200);

        var memberOnAdmin = loginOn(ADMIN_HOST, ADMIN);
        assertThat(status(memberOnAdmin)).isEqualTo(403);
        assertThat(memberOnAdmin.getResponse().getCookie(SessionTokens.COOKIE)).isNull();

        var bossOnCabinet = loginOn("localhost", BOSS);
        assertThat(status(bossOnCabinet)).isEqualTo(403);
        assertThat(body(bossOnCabinet)).contains(ADMIN_HOST);

        var boss = loginOn(ADMIN_HOST, BOSS);
        assertThat(status(boss)).isEqualTo(200);
        assertThat(json(boss, "$.role")).isEqualTo("SUPERADMIN");
    }
}
