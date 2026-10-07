package kz.wasender.whatsapp;

/**
 * @param participants number of members, null when the client does not report it
 * @param community    the group is a community itself; messages go only to its announcement group, never to it.
 *                     Boxed: Jackson 3 rejects a missing field for a primitive, and older bridges do not send it.
 */
public record GroupInfo(String jid, String name, boolean archived, Boolean member, Boolean canSend, Integer participants,
                        Boolean community) {

    public GroupInfo(String jid, String name, boolean archived, Boolean member, Boolean canSend) {
        this(jid, name, archived, member, canSend, null, null);
    }

    public boolean isCommunity() {
        return Boolean.TRUE.equals(community);
    }

    public boolean eligible() {
        return archived && !isCommunity() && Boolean.TRUE.equals(member) && Boolean.TRUE.equals(canSend);
    }
}
