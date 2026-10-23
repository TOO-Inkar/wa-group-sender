package kz.wasender.whatsapp;

import kz.wasender.config.WhatsAppProperties;
import kz.wasender.support.MutableClock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GroupPictureServiceTest {
    private static final String JID = "120363000000000001@g.us";
    private static final byte[] JPEG = {1, 2, 3};

    private final MutableClock clock = new MutableClock(LocalDateTime.of(2026, 10, 23, 10, 0));
    private final WhatsAppGateway gateway = mock(WhatsAppGateway.class);

    @TempDir
    Path dir;

    private GroupPictureService service() {
        var properties = new WhatsAppProperties(URI.create("http://bridge"), dir.resolve("qr.png"), Duration.ofSeconds(1),
                Duration.ofSeconds(1), dir, Duration.ofHours(24));
        return new GroupPictureService(gateway, properties, clock);
    }

    @Test
    void cachesPictureAndAbsenceUntilTtl() {
        var service = service();
        when(gateway.groupPicture(JID)).thenReturn(Optional.of(JPEG));
        when(gateway.groupPicture("2@g.us")).thenReturn(Optional.empty());

        assertThat(service.picture(JID)).contains(JPEG);
        assertThat(service.picture(JID)).contains(JPEG);
        assertThat(service.picture("2@g.us")).isEmpty();
        assertThat(service.picture("2@g.us")).isEmpty();
        verify(gateway, times(1)).groupPicture(JID);
        verify(gateway, times(1)).groupPicture("2@g.us");

        clock.advance(Duration.ofHours(25));
        service.picture(JID);
        verify(gateway, times(2)).groupPicture(JID);
    }

    @Test
    void keepsStalePictureWhenWhatsAppIsUnavailable() {
        var service = service();
        when(gateway.groupPicture(JID)).thenReturn(Optional.of(JPEG)).thenThrow(new IllegalStateException("offline"));
        service.picture(JID);
        clock.advance(Duration.ofHours(25));

        assertThat(service.picture(JID)).contains(JPEG);
    }

    @Test
    void unavailableWithoutCacheIsNotRememberedAsAbsent() {
        var service = service();
        when(gateway.groupPicture(JID)).thenThrow(new IllegalStateException("offline")).thenReturn(Optional.of(JPEG));

        assertThatThrownBy(() -> service.picture(JID)).isInstanceOf(GroupPictureService.UnavailableException.class);
        assertThat(service.picture(JID)).contains(JPEG);
    }

    @Test
    void ignoresAnythingButGroupJid() {
        assertThat(service().picture("../../etc/passwd")).isEmpty();
    }
}
