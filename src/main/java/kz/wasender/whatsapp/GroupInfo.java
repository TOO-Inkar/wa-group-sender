package kz.wasender.whatsapp;

// Boxed: старые версии моста не присылают participants и community.
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
