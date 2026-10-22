package kz.wasender.group;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * @param tooLarge      more members than GROUPS_MAX_PARTICIPANTS (off by default)
 * @param rejectedCount WhatsApp rejects (error 479) in a row; reset by a successful send
 * @param rejected      rejected twice in a row, so kept out of the dispatch until a send succeeds or it is reset
 */
public record GroupRecord(String jid, @Nullable String name, boolean archived, @Nullable Boolean member, @Nullable Boolean canSend, boolean active,
                          Instant lastSync, @Nullable Integer participants, boolean community, boolean tooLarge, int rejectedCount, boolean rejected) {
}
