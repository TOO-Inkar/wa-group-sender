package kz.wasender.group;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.jspecify.annotations.Nullable;

import java.time.Instant;

public record GroupRecord(String jid, @Nullable String name, boolean archived, @Nullable Boolean member, @Nullable Boolean canSend, boolean active,
                          Instant lastSync, @Nullable Integer participants, boolean community, boolean tooLarge, int rejectedCount, boolean rejected) {
    @JsonProperty
    public @Nullable GroupBlock blockedBy() {
        if (active) {
            return null;
        }
        if (community) {
            return GroupBlock.COMMUNITY;
        }
        if (Boolean.FALSE.equals(member)) {
            return GroupBlock.NOT_MEMBER;
        }
        if (Boolean.FALSE.equals(canSend)) {
            return GroupBlock.ADMINS_ONLY;
        }
        if (tooLarge) {
            return GroupBlock.TOO_LARGE;
        }
        if (rejected) {
            return GroupBlock.REJECTED;
        }
        return archived ? GroupBlock.SEND_FAILED : GroupBlock.NOT_ARCHIVED;
    }
}
