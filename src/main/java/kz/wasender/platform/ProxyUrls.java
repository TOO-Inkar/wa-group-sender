package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

public final class ProxyUrls {
    private static final Set<String> SCHEMES = Set.of("socks5", "http", "https");
    private static final int MAX_LENGTH = 500;
    private static final int MAX_PORT = 65535;
    private static final String INVALID = "Прокси: укажите адрес вида socks5://логин:пароль@хост:порт (поддерживаются socks5, http, https)";

    private ProxyUrls() {
    }

    public static @Nullable String normalize(@Nullable String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        var value = raw.strip();
        if (value.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("Прокси: адрес не длиннее " + MAX_LENGTH + " символов");
        }
        var uri = parse(value);
        var scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
        var path = uri.getRawPath();
        if (scheme == null || !SCHEMES.contains(scheme) || uri.getHost() == null || uri.getPort() < 1 || uri.getPort() > MAX_PORT
                || (path != null && !path.isEmpty() && !"/".equals(path)) || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException(INVALID);
        }
        var userInfo = uri.getRawUserInfo() == null ? "" : uri.getRawUserInfo() + "@";
        return scheme + "://" + userInfo + uri.getHost() + ":" + uri.getPort();
    }

    public static @Nullable String mask(@Nullable String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            var uri = new URI(url);
            return uri.getScheme() + "://" + uri.getHost() + ":" + uri.getPort();
        } catch (URISyntaxException e) {
            return "***";
        }
    }

    private static URI parse(String value) {
        try {
            return new URI(value);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException(INVALID);
        }
    }
}
