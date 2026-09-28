package kz.inkar.wasender.sheets;

import kz.inkar.wasender.request.RequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class SheetUpdateBuffer {

    private static final Logger log = LoggerFactory.getLogger(SheetUpdateBuffer.class);

    private final RequestSource source;
    private final RequestRepository requests;
    private final TaskScheduler scheduler;
    private final Map<Key, String> pending = new LinkedHashMap<>();
    private final Object flushLock = new Object();

    public SheetUpdateBuffer(RequestSource source, RequestRepository requests, TaskScheduler scheduler) {
        this.source = source;
        this.requests = requests;
        this.scheduler = scheduler;
    }

    public synchronized void put(String requestId, SheetField field, String value) {
        pending.put(new Key(requestId, field), value);
    }

    public synchronized int size() {
        return pending.size();
    }

    public void flushAsync() {
        scheduler.schedule(this::flushQuietly, scheduler.getClock().instant());
    }

    public void flushQuietly() {
        try {
            flush();
        } catch (RuntimeException e) {
            log.error("SHEETS progress flush failed, will retry on next flush: {}", e.getMessage());
        }
    }

    public void flush() {
        synchronized (flushLock) {
            Map<Key, String> batch;
            synchronized (this) {
                if (pending.isEmpty()) {
                    return;
                }
                batch = new LinkedHashMap<>(pending);
                pending.clear();
            }
            var writes = new ArrayList<CellWrite>();
            batch.forEach((key, value) -> requests.find(key.requestId())
                    .map(request -> request.sheetRow())
                    .ifPresent(row -> writes.add(new CellWrite(row, key.field(), value))));
            try {
                source.write(writes);
                log.debug("SHEETS flushed {} cells", writes.size());
            } catch (RuntimeException e) {
                synchronized (this) {
                    batch.forEach(pending::putIfAbsent);
                }
                throw e;
            }
        }
    }

    private record Key(String requestId, SheetField field) {
    }
}
