package kz.wasender.whatsapp;

/**
 * @param participants number of members, null when the client does not report it
 * @param community    the group is a community itself; messages go only to its announcement group, never to it
 */
public record GroupInfo(String jid, String name, boolean archived, Boolean member, Boolean canSend, Integer participants,
                        boolean community) {

    public GroupInfo(String jid, String name, boolean archived, Boolean member, Boolean canSend) {
        this(jid, name, archived, member, canSend, null, false);
    }

    public boolean eligible() {
        return archived && !community && Boolean.TRUE.equals(member) && Boolean.TRUE.equals(canSend);
    }
}
