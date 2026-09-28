package kz.inkar.wasender.whatsapp;

public record GroupInfo(String jid, String name, boolean archived, Boolean member, Boolean canSend) {

    public boolean eligible() {
        return archived && Boolean.TRUE.equals(member) && Boolean.TRUE.equals(canSend);
    }
}
