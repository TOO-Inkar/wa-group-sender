package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.platform")
public record PlatformProperties(String host, String appUrl, String accessTeamDomain, String accessAud) {
    public boolean hostRestricted() {
        return host != null && !host.isBlank();
    }

    public boolean platformHost(String serverName) {
        return hostRestricted() && host.strip().equalsIgnoreCase(serverName);
    }

    public boolean accessRequired() {
        return accessTeamDomain != null && !accessTeamDomain.isBlank() && accessAud != null && !accessAud.isBlank();
    }

    public String enterUrl(String code) {
        var base = appUrl == null ? "" : appUrl.strip().replaceAll("/+$", "");
        return base + "/api/auth/enter?code=" + code;
    }
}
