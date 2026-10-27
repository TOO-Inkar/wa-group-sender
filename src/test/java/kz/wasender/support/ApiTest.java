package kz.wasender.support;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import kz.wasender.engine.TenantEngines;
import kz.wasender.web.AdminTokenFilter;
import kz.wasender.web.SessionTokens;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

public abstract class ApiTest extends IntegrationTest {
    protected static final String ADMIN = "admin";
    protected static final String ADMIN_PASSWORD = "test-password";
    protected static final long LEGACY_TENANT = 1;

    @Autowired
    protected WebApplicationContext context;
    @Autowired
    protected AdminTokenFilter filter;
    @Autowired
    protected TenantEngines engines;

    protected MockMvc mvc;

    @BeforeEach
    void setUpMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filter).build();
    }

    protected MvcResult perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn();
    }

    protected MvcResult perform(MockHttpServletRequestBuilder request, Cookie session) throws Exception {
        return perform(request.cookie(session));
    }

    protected MvcResult perform(MockHttpServletRequestBuilder request, Cookie session, String json) throws Exception {
        return perform(request.cookie(session).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected MvcResult login(String username, String password, String ip) throws Exception {
        return perform(post("/api/auth/login").header("X-Real-IP", ip).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
    }

    protected Cookie session(String username, String password) throws Exception {
        var result = login(username, password, "198.51.100.1");
        if (result.getResponse().getStatus() != 200) {
            throw new AssertionError("login " + username + " failed: " + result.getResponse().getStatus());
        }
        return sessionOf(result);
    }

    protected Cookie admin() throws Exception {
        return session(ADMIN, ADMIN_PASSWORD);
    }

    protected static Cookie sessionOf(MvcResult result) {
        var cookie = result.getResponse().getCookie(SessionTokens.COOKIE);
        if (cookie == null) {
            throw new AssertionError("no session cookie");
        }
        return new Cookie(SessionTokens.COOKIE, cookie.getValue());
    }

    protected static String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    protected static Object json(MvcResult result, String path) throws Exception {
        return read(result, path);
    }

    protected static <T> T read(MvcResult result, String path) throws Exception {
        return JsonPath.read(body(result), path);
    }

    protected static int status(MvcResult result) {
        return result.getResponse().getStatus();
    }
}
