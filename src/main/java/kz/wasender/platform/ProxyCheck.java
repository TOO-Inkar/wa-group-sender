package kz.wasender.platform;

import org.jspecify.annotations.Nullable;

public record ProxyCheck(boolean ok, @Nullable String ip, @Nullable String country, @Nullable String city, @Nullable String org,
                         boolean whatsapp, @Nullable String error) {
    public static ProxyCheck failed(String error) {
        return new ProxyCheck(false, null, null, null, null, false, error);
    }
}
