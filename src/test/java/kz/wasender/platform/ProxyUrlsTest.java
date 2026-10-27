package kz.wasender.platform;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProxyUrlsTest {
    @Test
    void acceptsSupportedSchemesWithHostAndPort() {
        assertThat(ProxyUrls.normalize(" SOCKS5://user:p%40ss@10.0.0.1:1080 ")).isEqualTo("socks5://user:p%40ss@10.0.0.1:1080");
        assertThat(ProxyUrls.normalize("http://proxy.example.kz:3128/")).isEqualTo("http://proxy.example.kz:3128");
        assertThat(ProxyUrls.normalize("https://u:p@proxy.example.kz:443")).isEqualTo("https://u:p@proxy.example.kz:443");
        assertThat(ProxyUrls.normalize("  ")).isNull();
        assertThat(ProxyUrls.normalize(null)).isNull();
    }

    @Test
    void rejectsMalformedOrUnsupportedAddresses() {
        for (var bad : new String[]{"ftp://h:21", "socks5://host", "socks5://:1080", "host:1080", "socks5://h:99999", "http://h:80/path",
                "http://h:80?x=1", "socks5://us er@h:1080", "socks4://h:1080"}) {
            assertThatThrownBy(() -> ProxyUrls.normalize(bad)).as(bad).isInstanceOf(IllegalArgumentException.class).hasMessageStartingWith("Прокси");
        }
    }

    @Test
    void maskNeverShowsCredentials() {
        assertThat(ProxyUrls.mask("socks5://user:secret@10.0.0.1:1080")).isEqualTo("socks5://10.0.0.1:1080");
        assertThat(ProxyUrls.mask(null)).isNull();
        var tenant = new Tenant(2, "Кабинет 2", TenantStatus.ACTIVE, false, "code", Instant.EPOCH, "socks5://user:secret@h:1080");
        assertThat(tenant.toString()).doesNotContain("secret").contains("socks5://h:1080");
    }
}
