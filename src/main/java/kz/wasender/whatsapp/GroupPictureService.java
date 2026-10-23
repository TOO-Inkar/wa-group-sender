package kz.wasender.whatsapp;

import kz.wasender.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

@Service
public class GroupPictureService {
    private static final Logger log = LoggerFactory.getLogger(GroupPictureService.class);
    private static final Pattern GROUP_JID = Pattern.compile("[0-9-]+@g\\.us");
    private static final byte[] NONE = new byte[0];
    private static final int MAX_PARALLEL_FETCHES = 3;

    private final WhatsAppGateway gateway;
    private final WhatsAppProperties properties;
    private final Clock clock;
    private final Semaphore fetching = new Semaphore(MAX_PARALLEL_FETCHES);

    public GroupPictureService(WhatsAppGateway gateway, WhatsAppProperties properties, Clock clock) {
        this.gateway = gateway;
        this.properties = properties;
        this.clock = clock;
    }

    public Optional<byte[]> picture(String groupJid) {
        if (!GROUP_JID.matcher(groupJid).matches()) {
            return Optional.empty();
        }
        var file = properties.pictureDir().resolve(groupJid + ".jpg");
        var cached = read(file);
        if (cached.isPresent() && fresh(file)) {
            return nonEmpty(cached.get());
        }
        fetching.acquireUninterruptibly();
        try {
            var fetched = gateway.groupPicture(groupJid);
            write(file, fetched.orElse(NONE), clock);
            return fetched;
        } catch (IllegalStateException e) {
            log.debug("Group picture unavailable group_jid={}: {}", groupJid, e.getMessage());
            return nonEmpty(cached.orElseThrow(() -> new UnavailableException(e)));
        } finally {
            fetching.release();
        }
    }

    public static class UnavailableException extends RuntimeException {
        UnavailableException(Throwable cause) {
            super("WhatsApp не отдал фото группы", cause);
        }
    }

    private boolean fresh(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant().plus(properties.pictureTtl()).isAfter(clock.instant());
        } catch (IOException e) {
            return false;
        }
    }

    private static Optional<byte[]> nonEmpty(byte[] bytes) {
        return bytes.length == 0 ? Optional.empty() : Optional.of(bytes);
    }

    private static Optional<byte[]> read(Path file) {
        try {
            return Files.exists(file) ? Optional.of(Files.readAllBytes(file)) : Optional.empty();
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private static void write(Path file, byte[] bytes, Clock clock) {
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
            Files.setLastModifiedTime(file, FileTime.from(clock.instant()));
        } catch (IOException e) {
            log.warn("Group picture cache write failed {}: {}", file, e.toString());
        }
    }
}
