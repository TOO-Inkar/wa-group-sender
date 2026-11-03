package kz.wasender.platform;

import jakarta.servlet.http.Cookie;
import kz.wasender.engine.CurrentTenant;
import kz.wasender.support.ApiTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class PlatformApiTest extends ApiTest {
    private static final String PROXY = "socks5://proxyuser:proxysecret@10.0.0.1:1080";

    @Autowired
    AuditLog audit;
    @Autowired
    TenantRepository tenants;

    private MvcResult createTenant(Cookie admin, String name, String login) throws Exception {
        return perform(post("/api/platform/tenants").header("X-Real-IP", "203.0.113.50"), admin,
                "{\"name\":\"%s\",\"login\":\"%s\",\"password\":\"member-pass\",\"proxy\":\"%s\"}".formatted(name, login, PROXY));
    }

    private long createdId(Cookie admin, String name, String login) throws Exception {
        var result = createTenant(admin, name, login);
        assertThat(status(result)).as(body(result)).isEqualTo(201);
        return ((Number) json(result, "$.id")).longValue();
    }

    private int tenantApi(Cookie cookie) throws Exception {
        return status(perform(get("/api/admin/health").cookie(cookie)));
    }

    @Test
    void superadminSeesTenantOverviewWithLiveStats() throws Exception {
        var result = perform(get("/api/platform/tenants"), admin());

        assertThat(status(result)).isEqualTo(200);
        assertThat(json(result, "$.length()")).isEqualTo(1);
        assertThat(json(result, "$[0].name")).isEqualTo("Кабинет 1");
        assertThat(json(result, "$[0].legacy")).isEqualTo(true);
        assertThat(json(result, "$[0].status")).isEqualTo("ACTIVE");
        assertThat(json(result, "$[0].users")).isEqualTo(0);
        assertThat(json(result, "$[0].session")).isEqualTo("CONNECTED");
        assertThat(json(result, "$[0].dispatcher")).isInstanceOf(String.class);
        assertThat(json(result, "$[0].proxy")).isNull();
        assertThat(json(result, "$[0].proxyRequired")).isEqualTo(false);
        assertThat((Map<String, Object>) read(result, "$[0]")).containsKeys("createdAt", "account", "activeGroups", "sentToday",
                "sentLastHour", "queueLength", "stoppedByRisk");
    }

    @Test
    void createdTenantGetsAMemberWhoIsConfinedToIt() throws Exception {
        var admin = admin();
        var created = createTenant(admin, "Кабинет 2", "manager2");
        assertThat(status(created)).isEqualTo(201);
        long id = ((Number) json(created, "$.id")).longValue();
        assertThat(json(created, "$.users")).isEqualTo(1);
        assertThat(json(created, "$.legacy")).isEqualTo(false);
        assertThat(json(created, "$.proxy")).isEqualTo("socks5://10.0.0.1:1080");
        assertThat(json(created, "$.proxyRequired")).isEqualTo(false);
        assertThat(body(created)).doesNotContain("proxysecret");
        assertThat(engines.find(id)).isPresent();

        var login = login("manager2", "member-pass", "198.51.100.20");
        assertThat(status(login)).isEqualTo(200);
        assertThat(json(login, "$.role")).isEqualTo("MEMBER");
        assertThat(json(login, "$.tenant.id")).isEqualTo((int) id);
        assertThat(json(login, "$.tenant.name")).isEqualTo("Кабинет 2");
        var member = sessionOf(login);

        var scoped = perform(get("/api/admin/health"), member);
        assertThat(status(scoped)).isEqualTo(200);
        assertThat(scoped.getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(id);
        assertThat(status(perform(get("/api/platform/tenants"), member))).isEqualTo(403);
        assertThat(status(perform(get("/api/platform/audit"), member))).isEqualTo(403);
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/enter"), member))).isEqualTo(403);
        var foreign = perform(get("/api/admin/health").cookie(member).header("X-Tenant", "1"));
        assertThat(foreign.getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(id);
    }

    @Test
    void blockingATenantStopsItsEngineAndLocksItsUsersOut() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");
        var member = session("manager2", "member-pass");

        var blocked = perform(patch("/api/platform/tenants/" + id), admin, "{\"status\":\"BLOCKED\"}");
        assertThat(status(blocked)).isEqualTo(200);
        assertThat(json(blocked, "$.status")).isEqualTo("BLOCKED");
        assertThat(json(blocked, "$.session")).isEqualTo("STOPPED");
        assertThat(json(blocked, "$.dispatcher")).isEqualTo("stopped");
        assertThat(engines.find(id)).isEmpty();
        assertThat(tenantApi(member)).isEqualTo(401);
        assertThat(status(login("manager2", "member-pass", "198.51.100.21"))).isEqualTo(401);
        assertThat(json(perform(get("/api/auth/me"), member), "$.authenticated")).isEqualTo(false);
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/enter"), admin))).isEqualTo(409);

        assertThat(status(perform(patch("/api/platform/tenants/" + id), admin, "{\"status\":\"ACTIVE\"}"))).isEqualTo(200);
        assertThat(engines.find(id)).isPresent();
        assertThat(tenantApi(member)).isEqualTo(200);
        assertThat(audit.recent(id, 10)).extracting(AuditEntry::action)
                .contains(AuditAction.TENANT_BLOCKED, AuditAction.TENANT_UNBLOCKED);
    }

    @Test
    void disablingAUserOrResettingThePasswordEndsTheirSessions() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");
        var users = perform(get("/api/platform/tenants/" + id + "/users"), admin);
        assertThat(json(users, "$[0].login")).isEqualTo("manager2");
        assertThat(json(users, "$[0].enabled")).isEqualTo(true);
        assertThat(json(users, "$[0].lastLoginAt")).isNull();
        long userId = ((Number) json(users, "$[0].id")).longValue();

        var member = session("manager2", "member-pass");
        var disabled = perform(patch("/api/platform/users/" + userId), admin, "{\"enabled\":false}");
        assertThat(json(disabled, "$.enabled")).isEqualTo(false);
        assertThat(tenantApi(member)).isEqualTo(401);
        assertThat(status(login("manager2", "member-pass", "198.51.100.22"))).isEqualTo(401);

        perform(patch("/api/platform/users/" + userId), admin, "{\"enabled\":true}");
        var again = session("manager2", "member-pass");
        assertThat(tenantApi(again)).isEqualTo(200);
        assertThat(status(perform(patch("/api/platform/users/" + userId), admin, "{\"password\":\"short\"}"))).isEqualTo(400);
        assertThat(status(perform(patch("/api/platform/users/" + userId), admin, "{\"password\":\"new-member-pass\"}"))).isEqualTo(200);
        assertThat(tenantApi(again)).isEqualTo(401);
        assertThat(tenantApi(session("manager2", "new-member-pass"))).isEqualTo(200);
        assertThat(json(perform(get("/api/platform/tenants/" + id + "/users"), admin), "$[0].lastLoginAt")).isNotNull();
    }

    @Test
    void usersCanBeAddedAndRemovedButTheSuperadminIsNotExposed() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");

        var added = perform(post("/api/platform/tenants/" + id + "/users"), admin, "{\"login\":\"assistant\",\"password\":\"assistant-pass\"}");
        assertThat(status(added)).isEqualTo(201);
        long assistant = ((Number) json(added, "$.id")).longValue();
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/users"), admin, "{\"login\":\"Assistant\",\"password\":\"assistant-pass\"}")))
                .isEqualTo(409);
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/users"), admin, "{\"login\":\"admin\",\"password\":\"assistant-pass\"}")))
                .isEqualTo(409);
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/users"), admin, "{\"login\":\"x\",\"password\":\"assistant-pass\"}")))
                .isEqualTo(400);
        assertThat(status(perform(post("/api/platform/tenants/999/users"), admin, "{\"login\":\"third\",\"password\":\"assistant-pass\"}")))
                .isEqualTo(404);
        var session = session("assistant", "assistant-pass");

        assertThat(status(perform(delete("/api/platform/users/" + assistant), admin))).isEqualTo(204);
        assertThat(tenantApi(session)).isEqualTo(401);
        assertThat(status(perform(delete("/api/platform/users/" + assistant), admin))).isEqualTo(404);
        assertThat(status(perform(patch("/api/platform/users/1"), admin, "{\"enabled\":false}"))).isEqualTo(404);
        assertThat(status(perform(delete("/api/platform/users/1"), admin))).isEqualTo(404);
        assertThat(tenantApi(admin)).isEqualTo(200);
    }

    @Test
    void tenantValidationAnswersInRussianWithProperStatuses() throws Exception {
        var admin = admin();
        createdId(admin, "Кабинет 2", "manager2");

        var noName = perform(post("/api/platform/tenants"), admin, "{\"name\":\" \",\"login\":\"m3\",\"password\":\"member-pass\"}");
        assertThat(status(noName)).isEqualTo(400);
        assertThat(json(noName, "$.message")).isEqualTo("Укажите название кабинета");
        var duplicate = perform(post("/api/platform/tenants"), admin, "{\"name\":\"кабинет 2\",\"login\":\"m3x\",\"password\":\"member-pass\"}");
        assertThat(status(duplicate)).isEqualTo(409);
        assertThat(json(duplicate, "$.message")).isEqualTo("Кабинет с таким названием уже есть");
        assertThat(status(perform(post("/api/platform/tenants"), admin, "{\"name\":\"Третий\",\"login\":\"manager2\",\"password\":\"member-pass\"}")))
                .isEqualTo(409);
        assertThat(status(perform(post("/api/platform/tenants"), admin, "{\"name\":\"Третий\",\"login\":\"m3x\",\"password\":\"short\"}")))
                .isEqualTo(400);
        var badProxy = perform(post("/api/platform/tenants"), admin,
                "{\"name\":\"Третий\",\"login\":\"m3x\",\"password\":\"member-pass\",\"proxy\":\"ftp://h:21\"}");
        assertThat(status(badProxy)).isEqualTo(400);
        assertThat((String) read(badProxy, "$.message")).startsWith("Прокси");
        assertThat(status(perform(patch("/api/platform/tenants/1"), admin, "{\"status\":\"PAUSED\"}"))).isEqualTo(400);
        assertThat(status(perform(patch("/api/platform/tenants/1"), admin, "{\"name\":\"Кабинет 2\"}"))).isEqualTo(409);
        assertThat(status(perform(patch("/api/platform/tenants/404"), admin, "{\"name\":\"Новый\"}"))).isEqualTo(404);
        assertThat(tenants.findAll()).hasSize(2);
    }

    @Test
    void renameAndProxyChangesAreAuditedWithoutCredentials() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");

        var renamed = perform(patch("/api/platform/tenants/" + id), admin, "{\"name\":\"Склад\"}");
        assertThat(json(renamed, "$.name")).isEqualTo("Склад");
        assertThat(json(renamed, "$.proxy")).isEqualTo("socks5://10.0.0.1:1080");

        var changed = perform(patch("/api/platform/tenants/" + id), admin, "{\"proxy\":\"http://u:other-secret@proxy.example.kz:3128\"}");
        assertThat(json(changed, "$.proxy")).isEqualTo("http://proxy.example.kz:3128");
        assertThat(tenants.find(id).orElseThrow().proxyUrl()).isEqualTo("http://u:other-secret@proxy.example.kz:3128");
        assertThat(gateway.sessionState().name()).isEqualTo("CONNECTED");

        var cleared = perform(patch("/api/platform/tenants/" + id), admin, "{\"proxy\":null}");
        assertThat(json(cleared, "$.proxy")).isNull();
        assertThat(tenants.find(id).orElseThrow().proxyUrl()).isNull();

        var entries = audit.recent(id, 20);
        assertThat(entries).extracting(AuditEntry::action)
                .contains(AuditAction.TENANT_CREATED, AuditAction.USER_CREATED, AuditAction.TENANT_RENAMED, AuditAction.PROXY_CHANGED);
        assertThat(entries).allSatisfy(e -> {
            assertThat(e.detail() == null ? "" : e.detail()).doesNotContain("secret");
            assertThat(e.actor()).isEqualTo(ADMIN);
        });
        assertThat(entries).filteredOn(e -> e.action() == AuditAction.TENANT_CREATED).first()
                .satisfies(e -> assertThat(e.ip()).isEqualTo("203.0.113.50"));

        var listed = perform(get("/api/platform/audit?tenantId=" + id + "&limit=2"), admin);
        assertThat(json(listed, "$.length()")).isEqualTo(2);
        assertThat(json(listed, "$[0].tenantName")).isEqualTo("Склад");
        assertThat(json(listed, "$[0].action")).isEqualTo("PROXY_CHANGED");
        assertThat(body(perform(get("/api/platform/audit"), admin))).doesNotContain("secret");
    }

    @Test
    void proxyCheckRunsForATenantWithAProxyAndExplainsWhenThereIsNone() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");

        var checked = perform(post("/api/platform/tenants/" + id + "/proxy-check"), admin);
        assertThat(status(checked)).isEqualTo(200);
        assertThat(json(checked, "$.ok")).isEqualTo(true);
        assertThat(json(checked, "$.whatsapp")).isEqualTo(true);
        assertThat(json(checked, "$.country")).isEqualTo("KZ");
        assertThat(body(checked)).doesNotContain("proxysecret");

        var legacy = perform(post("/api/platform/tenants/" + LEGACY_TENANT + "/proxy-check"), admin);
        assertThat(status(legacy)).isEqualTo(400);
        assertThat(json(legacy, "$.message")).isEqualTo("Прокси не задан");
        assertThat(status(perform(post("/api/platform/tenants/77/proxy-check"), admin))).isEqualTo(404);
    }

    @Test
    void deleteRequiresTheExactNameAndNeverTouchesTheLegacyTenant() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");

        var legacy = perform(post("/api/platform/tenants/1/delete"), admin, "{\"confirmName\":\"Кабинет 1\"}");
        assertThat(status(legacy)).isEqualTo(409);
        assertThat(status(perform(post("/api/platform/tenants/" + id + "/delete"), admin, "{\"confirmName\":\"Кабинет\"}"))).isEqualTo(400);
        assertThat(status(perform(post("/api/platform/tenants/77/delete"), admin, "{\"confirmName\":\"x\"}"))).isEqualTo(404);

        assertThat(status(perform(post("/api/platform/tenants/" + id + "/delete"), admin, "{\"confirmName\":\"Кабинет 2\"}"))).isEqualTo(204);
        assertThat(engines.find(id)).isEmpty();
        assertThat(tenants.find(id)).isEmpty();
        assertThat(status(login("manager2", "member-pass", "198.51.100.30"))).isEqualTo(401);
        assertThat(audit.recent(id, 5)).extracting(AuditEntry::action, AuditEntry::detail).contains(tuple(
                AuditAction.TENANT_DELETED, "Кабинет 2"));
    }

    @Test
    void enterCodeOpensTheTenantOnceAndExpires() throws Exception {
        var admin = admin();
        var id = createdId(admin, "Кабинет 2", "manager2");

        var link = perform(post("/api/platform/tenants/" + id + "/enter"), admin);
        assertThat(status(link)).isEqualTo(200);
        String url = read(link, "$.url");
        assertThat(url).startsWith("/api/auth/enter?code=");

        var entered = perform(get(URI.create(url)).header("X-Real-IP", "198.51.100.77"));
        assertThat(status(entered)).isEqualTo(302);
        assertThat(entered.getResponse().getHeader("Location")).isEqualTo("/");
        var inside = sessionOf(entered);
        var me = perform(get("/api/auth/me"), inside);
        assertThat(json(me, "$.role")).isEqualTo("SUPERADMIN");
        assertThat(json(me, "$.tenant.id")).isEqualTo((int) id);
        assertThat(perform(get("/api/admin/health"), inside).getRequest().getAttribute(CurrentTenant.ATTRIBUTE)).isEqualTo(id);
        assertThat(status(perform(get(URI.create(url))))).isEqualTo(400);
        assertThat(audit.recent(id, 10)).filteredOn(e -> e.action() == AuditAction.ENTER).singleElement()
                .satisfies(e -> assertThat(e.ip()).isEqualTo("198.51.100.77"));

        String late = read(perform(post("/api/platform/tenants/" + id + "/enter"), admin), "$.url");
        clock.advance(Duration.ofSeconds(61));
        assertThat(status(perform(get(URI.create(late))))).isEqualTo(400);
        assertThat(status(perform(get("/api/auth/enter?code=nonsense")))).isEqualTo(400);
        assertThat(status(perform(post("/api/platform/tenants/404/enter"), admin))).isEqualTo(404);
    }

    @Test
    void auditListIsNewestFirstAndFilterable() throws Exception {
        var admin = admin();
        createdId(admin, "Кабинет 2", "manager2");
        login("ghost", "whatever", "203.0.113.99");

        List<String> actions = read(perform(get("/api/platform/audit"), admin), "$[*].action");
        assertThat(actions.getFirst()).isEqualTo("LOGIN_FAILED");
        assertThat(actions).contains("LOGIN", "TENANT_CREATED", "USER_CREATED");
        List<Object> legacyOnly = read(perform(get("/api/platform/audit?tenantId=1"), admin), "$[*].tenantId");
        assertThat(legacyOnly).isNotEmpty().allSatisfy(t -> assertThat(t).isEqualTo(1));
    }
}
