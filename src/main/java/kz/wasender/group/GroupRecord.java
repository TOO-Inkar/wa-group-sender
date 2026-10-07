package kz.wasender.group;

import java.time.Instant;

/**
 * @param tooLarge more members than GROUPS_MAX_PARTICIPANTS: the server rejects sends to such groups (error 479),
 *                 so they are kept out of the dispatch
 */
public record GroupRecord(String jid, String name, boolean archived, Boolean member, Boolean canSend, boolean active, Instant lastSync,
                          Integer participants, boolean community, boolean tooLarge) {
}
