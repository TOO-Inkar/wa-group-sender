package kz.wasender.platform;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

public final class TtlCache<K, V> {
    private final Duration ttl;
    private final Clock clock;
    private final Map<K, Cached<V>> entries = new ConcurrentHashMap<>();

    public TtlCache(Duration ttl, Clock clock) {
        this.ttl = ttl;
        this.clock = clock;
    }

    public V get(K key, Function<K, V> loader) {
        var now = Instant.now(clock);
        var cached = entries.get(key);
        if (cached != null && cached.expires().isAfter(now)) {
            return cached.value();
        }
        var value = loader.apply(key);
        entries.put(key, new Cached<>(value, now.plus(ttl)));
        return value;
    }

    public void invalidate(K key) {
        entries.remove(key);
    }

    public void clear() {
        entries.clear();
    }

    private record Cached<V>(V value, Instant expires) {
    }
}
